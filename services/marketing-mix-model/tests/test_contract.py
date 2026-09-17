import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import Observation, PaidChannel, readiness


def observation(day: int) -> Observation:
    return Observation(
        time=date(2026, 1, 1) + timedelta(days=day),
        kpi=100,
        paid={"meta_ads": PaidChannel(spend=10, impressions=1000)},
        organic={"instagram": {"impressions": 500}},
        searches={"brand": 25},
        leads=4,
    )


def test_readiness_requires_history():
    result = readiness([observation(0), observation(1)])
    assert result["status"] == "insufficient_data"
    assert result["periods"] == 2


def test_readiness_accepts_valid_history(monkeypatch):
    monkeypatch.setattr("app.MIN_PERIODS", 2)
    result = readiness([observation(0), observation(1)])
    assert result["status"] == "ready"
    assert result["channels"]["paid"] == ["meta_ads"]
    assert result["channels"]["organic"] == ["instagram"]
