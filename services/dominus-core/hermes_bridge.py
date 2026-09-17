"""Hermes-facing bridge for the Dominus read-only Maestro tools.

The bridge deliberately knows only the tool-call protocol.  Hermes can pass
function calls here without receiving Supabase credentials or implementation
details from the Maestro API.
"""

from __future__ import annotations

import json
from typing import Any, Mapping

from maestro_adapter import MaestroToolAdapter, MaestroToolError


DOMINUS_SYSTEM_INSTRUCTIONS = """Você é o Dominus, agente operacional da Domínio.
Responda em português brasileiro, de forma direta, objetiva e legível.
Antes de responder, interprete o contexto e resolva nomes, apelidos, datas e
referências como 'ele', 'ela', 'esse Job' e 'amanhã'.

Para Jobs, 'atrasado' significa post_date vencido; para tarefas/subtarefas,
use deadline. Ao explicar um atraso, diferencie subtarefas pendentes da pessoa
citada e subtarefas de outras pessoas que ainda bloqueiam o Job.
Não invente dados. Fatos consultados, interpretação e recomendação devem ficar
separados. O Maestro é a autoridade de dados e permissões; nenhuma ferramenta
de escrita está disponível nesta fase.
"""


class HermesToolBridge:
    """Small protocol boundary that can be registered as Hermes functions."""

    def __init__(self, adapter: MaestroToolAdapter) -> None:
        self.adapter = adapter

    @property
    def system_instructions(self) -> str:
        return DOMINUS_SYSTEM_INSTRUCTIONS

    def tools(self) -> list[dict[str, Any]]:
        return self.adapter.tool_definitions()

    def invoke(self, name: str, arguments: Mapping[str, Any] | str | None = None) -> dict[str, Any]:
        """Invoke a Hermes function call and return JSON-safe tool output."""
        try:
            parsed = self._parse_arguments(arguments)
            return {"ok": True, "result": self.adapter.call(name, parsed)}
        except (MaestroToolError, ValueError, TypeError, json.JSONDecodeError) as error:
            return {
                "ok": False,
                "error": "Não foi possível consultar o Maestro com essa solicitação.",
                "detail": str(error),
            }

    @staticmethod
    def _parse_arguments(arguments: Mapping[str, Any] | str | None) -> dict[str, Any]:
        if arguments is None:
            return {}
        if isinstance(arguments, str):
            value = json.loads(arguments or "{}")
            if not isinstance(value, dict):
                raise ValueError("argumentos da ferramenta devem ser um objeto JSON")
            return value
        if not isinstance(arguments, Mapping):
            raise TypeError("argumentos da ferramenta devem ser um objeto")
        return dict(arguments)

