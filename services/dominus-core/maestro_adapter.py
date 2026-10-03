"""Read-only Hermes/Dominus adapter for the Maestro data contract.

The Dominus core never receives database credentials.  It receives a short-lived
Maestro session token and can only invoke the allowlisted read operations below.
The transport is intentionally injectable so the contract can be tested without
network access and later embedded in the Hermes runtime on the VPS.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Callable, Literal, Mapping
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import json
from zoneinfo import ZoneInfo


ToolName = Literal[
    "buscar_jobs",
    "buscar_tarefas",
    "consultar_agenda",
    "consultar_dashboard",
]

MAESTRO_TOOLS: tuple[dict[str, Any], ...] = (
    {
        "type": "function",
        "name": "buscar_jobs",
        "description": (
            "Consulta Jobs no Maestro. Use post_date para a data de postagem; "
            "não confunda com deadline, que pertence a tarefas/subtarefas."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "responsible_id": {"type": "string"},
                "client_id": {"type": "string"},
                "status": {"type": "string"},
                "post_date": {"type": "string", "description": "AAAA-MM-DD"},
                "post_date_from": {"type": "string", "description": "AAAA-MM-DD"},
                "post_date_to": {"type": "string", "description": "AAAA-MM-DD"},
                "overdue_only": {"type": "boolean"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100},
                "offset": {"type": "integer", "minimum": 0},
            },
            "additionalProperties": False,
        },
    },
    {
        "type": "function",
        "name": "buscar_tarefas",
        "description": (
            "Consulta tarefas/subtarefas no Maestro. Use deadline para o prazo "
            "da tarefa e job_id para relacioná-la ao Job."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "job_id": {"type": "string"},
                "responsible_id": {"type": "string"},
                "status": {"type": "string"},
                "deadline": {"type": "string", "description": "AAAA-MM-DD"},
                "deadline_from": {"type": "string", "description": "AAAA-MM-DD"},
                "deadline_to": {"type": "string", "description": "AAAA-MM-DD"},
                "overdue_only": {"type": "boolean"},
                "include_completed": {"type": "boolean"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100},
                "offset": {"type": "integer", "minimum": 0},
            },
            "additionalProperties": False,
        },
    },
    {
        "type": "function",
        "name": "consultar_agenda",
        "description": "Consulta compromissos da Agenda em um intervalo de datas.",
        "parameters": {
            "type": "object",
            "properties": {
                "date_from": {"type": "string", "description": "AAAA-MM-DD"},
                "date_to": {"type": "string", "description": "AAAA-MM-DD"},
                "client_id": {"type": "string"},
                "status": {"type": "string"},
                "type": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100},
                "offset": {"type": "integer", "minimum": 0},
            },
            "additionalProperties": False,
        },
    },
    {
        "type": "function",
        "name": "consultar_dashboard",
        "description": (
            "Consulta o resumo operacional permitido pelo perfil atual, "
            "incluindo Jobs, tarefas, Agenda e indicadores de fluxo."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
    },
)


@dataclass(frozen=True)
class MaestroToolResult:
    tool: ToolName
    data: Any
    source: str = "Maestro"
    retrieved_at: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "tool": self.tool,
            "source": self.source,
            "retrieved_at": self.retrieved_at,
            "data": self.data,
        }


Transport = Callable[[Mapping[str, Any]], Mapping[str, Any]]


class MaestroToolError(RuntimeError):
    """Expected adapter error that can be shown safely to the agent."""


class MaestroToolAdapter:
    """Allowlisted, read-only adapter used by the Hermes/Dominus core."""

    allowed_tools = frozenset(definition["name"] for definition in MAESTRO_TOOLS)
    allowed_entities = {"Job", "Subtask", "AgendaEvent"}
    timezone = ZoneInfo("America/Manaus")

    def __init__(
        self,
        endpoint: str,
        session_token: str,
        *,
        timeout: float = 15.0,
        transport: Transport | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        if not endpoint.strip():
            raise ValueError("endpoint do Maestro é obrigatório")
        if not session_token.strip():
            raise ValueError("token de sessão do Maestro é obrigatório")
        self.endpoint = endpoint.rstrip("/")
        self.session_token = session_token
        self.timeout = timeout
        self._transport = transport or self._http_transport
        self._now = now or (lambda: datetime.now(self.timezone))

    def tool_definitions(self) -> list[dict[str, Any]]:
        """Return a copy so Hermes cannot mutate the module-level contract."""
        return json.loads(json.dumps(MAESTRO_TOOLS))

    def call(self, tool: str, arguments: Mapping[str, Any] | None = None) -> dict[str, Any]:
        if tool not in self.allowed_tools:
            raise MaestroToolError(f"ferramenta não permitida: {tool}")
        args = dict(arguments or {})
        body = self._build_request(tool, args)
        response = dict(self._transport(body))
        if response.get("error"):
            raise MaestroToolError(str(response["error"]))
        return MaestroToolResult(
            tool=tool,  # type: ignore[arg-type]
            data=response.get("data"),
            retrieved_at=self._now().isoformat(),
        ).as_dict()

    def _build_request(self, tool: str, args: dict[str, Any]) -> dict[str, Any]:
        limit = self._int_arg(args, "limit", 50, 1, 100)
        offset = self._int_arg(args, "offset", 0, 0, 1_000_000)
        if tool == "consultar_dashboard":
            return {"operation": "dashboard"}
        if tool == "buscar_jobs":
            filters = self._filters(args, {
                "responsible_id", "client_id", "status", "post_date",
            })
            self._date_filter(filters, args, "post_date")
            if args.get("overdue_only"):
                filters["post_date"] = {"lt": self._today().isoformat()}
                filters["status"] = {"not_in": ["completed", "scheduled", "cancelled"]}
            return {"operation": "filter", "entity": "Job", "filters": filters, "sort": "-post_date", "offset": offset, "limit": limit}
        if tool == "buscar_tarefas":
            filters = self._filters(args, {"job_id", "responsible_id", "status", "deadline"})
            self._date_filter(filters, args, "deadline")
            if args.get("overdue_only"):
                filters["deadline"] = {"lt": self._today().isoformat()}
                filters["is_completed"] = False
                filters["status"] = {"not_in": ["completed"]}
            elif not args.get("include_completed"):
                filters["is_completed"] = False
                filters["status"] = {"not_in": ["completed"]}
            return {"operation": "filter", "entity": "Subtask", "filters": filters, "sort": "deadline", "offset": offset, "limit": limit}
        if tool == "consultar_agenda":
            filters = self._filters(args, {"client_id", "status", "type"})
            date_from = args.get("date_from")
            date_to = args.get("date_to")
            if date_from or date_to:
                filters["date"] = {key: value for key, value in (("gte", date_from), ("lte", date_to)) if value}
            return {"operation": "filter", "entity": "AgendaEvent", "filters": filters, "sort": "date", "offset": offset, "limit": limit}
        raise MaestroToolError(f"contrato não implementado: {tool}")

    def _http_transport(self, body: Mapping[str, Any]) -> Mapping[str, Any]:
        request = Request(
            f"{self.endpoint}/functions/v1/maestro-data",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.session_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            # The bridge accepts only HMAC-authenticated requests whose exact endpoint
            # is in DOMINUS_MAESTRO_ENDPOINTS before writing this session file.
            # Keep this narrowly scoped exception in sync with that allowlist contract.
            # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected
            with urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            raise MaestroToolError("não foi possível consultar o Maestro") from error

    @staticmethod
    def _filters(args: Mapping[str, Any], allowed: set[str]) -> dict[str, Any]:
        return {key: args[key] for key in allowed if args.get(key) not in (None, "")}

    @staticmethod
    def _date_filter(filters: dict[str, Any], args: Mapping[str, Any], field: str) -> None:
        start = args.get(f"{field}_from")
        end = args.get(f"{field}_to")
        if start or end:
            filters[field] = {key: value for key, value in (("gte", start), ("lte", end)) if value}

    def _today(self) -> date:
        return self._now().astimezone(self.timezone).date()

    @staticmethod
    def _int_arg(args: Mapping[str, Any], name: str, default: int, minimum: int, maximum: int) -> int:
        value = args.get(name, default)
        if isinstance(value, bool):
            raise MaestroToolError(f"{name} deve ser numérico")
        try:
            parsed = int(value)
        except (TypeError, ValueError) as error:
            raise MaestroToolError(f"{name} deve ser numérico") from error
        return max(minimum, min(maximum, parsed))
