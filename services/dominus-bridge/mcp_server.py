from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import CallToolRequestParams, CallToolResult, ListToolsResult, TextContent, Tool


PROJECT_DIR = Path(os.environ.get("DOMINUS_PROJECT_DIR", "/opt/hermes/projects/dominus"))
sys.path.insert(0, str(PROJECT_DIR))
from maestro_adapter import MaestroToolAdapter, MaestroToolError  # noqa: E402


SESSION_FILE = Path(os.environ.get("DOMINUS_SESSION_FILE", "/opt/hermes/run/maestro-session.json"))


def _adapter() -> MaestroToolAdapter:
    try:
        session = json.loads(SESSION_FILE.read_text(encoding="utf-8"))
        token = str(session.get("token") or "").strip()
        endpoint = str(session.get("endpoint") or "").strip().rstrip("/")
    except OSError as error:
        raise MaestroToolError("sessão do Maestro indisponível") from error
    except json.JSONDecodeError as error:
        raise MaestroToolError("sessão do Maestro inválida") from error
    return MaestroToolAdapter(endpoint, token, timeout=20)


def _tools() -> list[Tool]:
    return [
        Tool(
            name=definition["name"],
            description=definition["description"],
            inputSchema=definition["parameters"],
        )
        for definition in _adapter().tool_definitions()
    ]


async def list_tools(_context: Any, _params: Any) -> ListToolsResult:
    return ListToolsResult(tools=_tools())


async def call_tool(_context: Any, params: CallToolRequestParams) -> CallToolResult:
    try:
        result = _adapter().call(params.name, params.arguments or {})
        return CallToolResult(
            content=[TextContent(text=json.dumps(result, ensure_ascii=False))],
            structuredContent=result,
        )
    except Exception as error:
        return CallToolResult(
            content=[TextContent(text="Não foi possível consultar o Maestro com essa solicitação.")],
            isError=True,
        )


async def main() -> None:
    server = Server(
        "dominus-maestro",
        version="0.1.0",
        instructions="Consultas operacionais somente leitura, filtradas pela sessão curta do Maestro.",
        on_list_tools=list_tools,
        on_call_tool=call_tool,
    )
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    import anyio

    anyio.run(main)
