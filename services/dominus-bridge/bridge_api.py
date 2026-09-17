from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


app = FastAPI(title="Dominus Hermes Bridge", docs_url=None, redoc_url=None)
RUN_DIR = Path(os.environ.get("DOMINUS_RUN_DIR", "/opt/hermes/run"))
SESSION_FILE = RUN_DIR / "maestro-session.json"
HERMES_BIN = os.environ.get("HERMES_BIN", "/opt/hermes/.local/bin/hermes")
PROJECT_DIR = os.environ.get("HERMES_PROJECT_DIR", "/opt/hermes/projects/dominus")
MAESTRO_ENDPOINT = os.environ.get("DOMINUS_MAESTRO_ENDPOINT", "").rstrip("/")
MAESTRO_ENDPOINTS = {
    value.strip().rstrip("/")
    for value in os.environ.get("DOMINUS_MAESTRO_ENDPOINTS", MAESTRO_ENDPOINT).split(",")
    if value.strip()
}
BRIDGE_SECRET = os.environ.get("DOMINUS_HERMES_BRIDGE_SECRET", "")
MAX_BODY_BYTES = 96 * 1024
MAX_SKEW_SECONDS = 90
HERMES_TIMEOUT_SECONDS = int(os.environ.get("DOMINUS_HERMES_TIMEOUT_SECONDS", "90"))
RUN_LOCK = threading.Lock()


def _json_error(message: str, status: int) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status)


def _signature_valid(timestamp: str, body: bytes, signature: str) -> bool:
    if not BRIDGE_SECRET or not timestamp or not signature:
        return False
    try:
        timestamp_value = int(timestamp)
    except ValueError:
        return False
    if abs(int(time.time()) - timestamp_value) > MAX_SKEW_SECONDS:
        return False
    expected = hmac.new(
        BRIDGE_SECRET.encode("utf-8"),
        timestamp.encode("ascii") + b"." + body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature.lower())


def _bounded_history(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    history: list[dict[str, str]] = []
    for item in value[-8:]:
        if not isinstance(item, dict) or item.get("role") not in {"user", "assistant"}:
            continue
        content = str(item.get("content") or "").strip()
        if content:
            history.append({"role": item["role"], "content": content[:1600]})
    return history


def _prompt(payload: dict[str, Any]) -> str:
    question = str(payload.get("question") or "").strip()[:4000]
    history = _bounded_history(payload.get("history"))
    lines = [
        "Atenda a solicitação abaixo como Dominus.",
        "Use as ferramentas MCP do Maestro quando precisar de dados atuais.",
        "O token da sessão já foi validado pelo gateway; respeite rigorosamente o escopo retornado pelo Maestro.",
        "Não revele JSON bruto, credenciais ou detalhes internos das ferramentas.",
        "Responda em português brasileiro, de forma direta, objetiva e legível no WhatsApp.",
    ]
    if history:
        lines.append("Histórico recente da mesma conversa (apenas contexto):")
        lines.extend(f"- {item['role']}: {item['content']}" for item in history)
    lines.append(f"Pergunta atual: {question}")
    return "\n".join(lines)


def _write_session(token: str, endpoint: str) -> None:
    RUN_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix="session-", dir=RUN_DIR, text=True)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump({"token": token, "endpoint": endpoint}, handle)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, SESSION_FILE)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)


def _clear_token() -> None:
    try:
        SESSION_FILE.unlink()
    except FileNotFoundError:
        pass


def _run_hermes(prompt: str) -> str:
    if not MAESTRO_ENDPOINT:
        raise RuntimeError("ponte sem endpoint do Maestro")
    completed = subprocess.run(
        [
            HERMES_BIN,
            "-z",
            prompt,
            "--provider",
            os.environ.get("DOMINUS_HERMES_PROVIDER", "openai-codex"),
            "--model",
            os.environ.get("DOMINUS_HERMES_MODEL", "gpt-5.6-luna"),
            "--reasoning",
            os.environ.get("DOMINUS_HERMES_REASONING", "high"),
            "--in",
            PROJECT_DIR,
            "--no-restore-cwd",
        ],
        cwd=PROJECT_DIR,
        env={**os.environ, "HERMES_ACCEPT_HOOKS": "1"},
        capture_output=True,
        text=True,
        timeout=HERMES_TIMEOUT_SECONDS,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError("Hermes não conseguiu processar a consulta")
    answer = completed.stdout.strip()
    if not answer:
        raise RuntimeError("Hermes retornou uma resposta vazia")
    return answer[:3500]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "dominus-hermes-bridge"}


@app.post("/v1/respond")
async def respond(request: Request) -> JSONResponse:
    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        return _json_error("requisição excede o limite", 413)
    if not _signature_valid(
        request.headers.get("x-dominus-bridge-timestamp", ""),
        body,
        request.headers.get("x-dominus-bridge-signature", ""),
    ):
        return _json_error("ponte não autorizada", 401)
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return _json_error("JSON inválido", 400)
    if not isinstance(payload, dict):
        return _json_error("corpo inválido", 400)
    token = str(payload.get("maestro_session_token") or "").strip()
    endpoint = str(payload.get("maestro_endpoint") or "").strip().rstrip("/")
    question = str(payload.get("question") or "").strip()
    if not token or not question or endpoint not in MAESTRO_ENDPOINTS:
        return _json_error("sessão e pergunta são obrigatórias", 400)
    if len(token) > 4096:
        return _json_error("sessão inválida", 400)

    # A sessão é serializada para que um processo MCP nunca leia o token de
    # outro usuário enquanto o Hermes estiver usando a ferramenta.
    with RUN_LOCK:
        try:
            _write_session(token, endpoint)
            answer = _run_hermes(_prompt(payload))
            return JSONResponse({"text": answer, "tools_used": []})
        except subprocess.TimeoutExpired:
            return _json_error("A análise demorou mais que o limite permitido.", 504)
        except Exception:
            return _json_error("Não foi possível consultar o Dominus agora.", 502)
        finally:
            _clear_token()
