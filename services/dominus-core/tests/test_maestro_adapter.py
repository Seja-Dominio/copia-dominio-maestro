import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from maestro_adapter import MAESTRO_TOOLS, MaestroToolAdapter, MaestroToolError


def make_adapter(calls):
    def transport(body):
        calls.append(body)
        return {"data": [{"id": "job-1"}]}

    return MaestroToolAdapter(
        "https://example.supabase.co",
        "signed-session",
        transport=transport,
        now=lambda: datetime(2026, 9, 15, 12, 0, tzinfo=ZoneInfo("America/Manaus")),
    )


def test_exposes_only_read_tools():
    names = {tool["name"] for tool in MAESTRO_TOOLS}
    assert names == {"buscar_jobs", "buscar_tarefas", "consultar_agenda", "consultar_dashboard"}
    assert not names.intersection({"criar_job", "editar_job", "excluir_job"})


def test_jobs_use_post_date_and_backend_range_filters():
    calls = []
    result = make_adapter(calls).call("buscar_jobs", {
        "post_date_from": "2026-09-10",
        "post_date_to": "2026-09-15",
        "limit": 20,
    })
    assert result["data"] == [{"id": "job-1"}]
    assert calls[0]["entity"] == "Job"
    assert calls[0]["filters"]["post_date"] == {"gte": "2026-09-10", "lte": "2026-09-15"}
    assert calls[0]["limit"] == 20


def test_overdue_jobs_exclude_completed_scheduled_and_cancelled():
    calls = []
    make_adapter(calls).call("buscar_jobs", {"overdue_only": True})
    assert calls[0]["filters"] == {
        "post_date": {"lt": "2026-09-15"},
        "status": {"not_in": ["completed", "scheduled", "cancelled"]},
    }


def test_tasks_distinguish_deadline_and_completion():
    calls = []
    make_adapter(calls).call("buscar_tarefas", {"job_id": "job-1", "overdue_only": True})
    assert calls[0]["entity"] == "Subtask"
    assert calls[0]["filters"]["job_id"] == "job-1"
    assert calls[0]["filters"]["deadline"] == {"lt": "2026-09-15"}
    assert calls[0]["filters"]["is_completed"] is False


def test_unknown_tool_is_rejected():
    adapter = make_adapter([])
    try:
        adapter.call("excluir_job")
    except MaestroToolError as error:
        assert "não permitida" in str(error)
    else:
        raise AssertionError("ferramenta de escrita deveria ser rejeitada")
