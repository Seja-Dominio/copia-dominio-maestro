import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from hermes_bridge import HermesToolBridge
from maestro_adapter import MaestroToolAdapter


def bridge(calls):
    adapter = MaestroToolAdapter(
        "https://example.supabase.co",
        "signed-session",
        transport=lambda body: (calls.append(body) or {"data": {"jobs": []}}),
    )
    return HermesToolBridge(adapter)


def test_bridge_exposes_adapter_tools_and_invokes_json_arguments():
    calls = []
    current = bridge(calls)
    assert {tool["name"] for tool in current.tools()} == {
        "buscar_jobs",
        "buscar_tarefas",
        "consultar_agenda",
        "consultar_dashboard",
    }
    result = current.invoke("buscar_jobs", '{"post_date": "2026-09-15"}')
    assert result["ok"] is True
    assert calls[0]["filters"] == {"post_date": "2026-09-15"}


def test_bridge_returns_safe_error_for_unknown_or_invalid_calls():
    current = bridge([])
    unknown = current.invoke("excluir_job", {})
    invalid = current.invoke("buscar_jobs", "[]")
    assert unknown["ok"] is False
    assert invalid["ok"] is False
    assert "Maestro" in invalid["error"]
