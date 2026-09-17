from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from datetime import date
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from meridian_runner import run_meridian


class PaidChannel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spend: float = Field(default=0, ge=0)
    impressions: float = Field(default=0, ge=0)
    reach: float | None = Field(default=None, ge=0)
    clicks: float | None = Field(default=None, ge=0)


class OrganicChannel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    impressions: float = Field(default=0, ge=0)
    reach: float | None = Field(default=None, ge=0)
    clicks: float | None = Field(default=None, ge=0)


class Observation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    time: date
    geo: str = Field(default="national", min_length=1, max_length=80)
    kpi: float = Field(ge=0)
    paid: dict[str, PaidChannel] = Field(default_factory=dict)
    organic: dict[str, OrganicChannel] = Field(default_factory=dict)
    searches: dict[str, float] = Field(default_factory=dict)
    leads: float | None = Field(default=None, ge=0)
    controls: dict[str, float] = Field(default_factory=dict)

    @field_validator("paid", "organic", "searches", "controls")
    @classmethod
    def limit_dimensions(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(value) > 32:
            raise ValueError("Cada dimensão aceita no máximo 32 canais.")
        return value


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_id: str = Field(min_length=1, max_length=160)
    start: date | None = None
    end: date | None = None
    observations: list[Observation] | None = None
    run_model: bool = False
    kpi_type: str = Field(default="revenue", pattern="^(revenue|non_revenue)$")


app = FastAPI(title="Maestro Marketing Mix Model", version="0.1.0")
MIN_PERIODS = max(8, int(os.getenv("MMM_MIN_PERIODS", "26")))
MAX_OBSERVATIONS = min(5000, max(1, int(os.getenv("MMM_MAX_OBSERVATIONS", "5000"))))


def _authorized(token: str | None) -> bool:
    expected = os.getenv("MMM_SERVICE_TOKEN", "")
    return bool(expected) and bool(token) and hmac.compare_digest(token, expected)


def _check_access(token: str | None) -> None:
    if not _authorized(token):
        raise HTTPException(status_code=401, detail="Token do serviço inválido.")


def _normalise_observations(observations: list[Observation]) -> list[Observation]:
    by_key: dict[tuple[str, date], Observation] = {}
    for item in observations:
        by_key[(item.geo, item.time)] = item
    return [by_key[key] for key in sorted(by_key, key=lambda value: (value[0], value[1]))]


def readiness(observations: list[Observation]) -> dict[str, Any]:
    observations = _normalise_observations(observations)
    periods = sorted({item.time.isoformat() for item in observations})
    geos = sorted({item.geo for item in observations})
    paid_channels = sorted({channel for item in observations for channel in item.paid})
    organic_channels = sorted({channel for item in observations for channel in item.organic})
    search_channels = sorted({channel for item in observations for channel in item.searches})
    missing: list[str] = []
    if len(periods) < MIN_PERIODS:
        missing.append(f"{MIN_PERIODS} períodos distintos; recebidos {len(periods)}")
    if not paid_channels:
        missing.append("ao menos um canal pago")
    for channel in paid_channels:
        if not any(item.paid[channel].spend > 0 and item.paid[channel].impressions > 0 for item in observations if channel in item.paid):
            missing.append(f"impressões e investimento válidos para {channel}")
    if not any(item.kpi > 0 for item in observations):
        missing.append("um KPI maior que zero")
    return {
        "status": "ready" if not missing else "insufficient_data",
        "observations": len(observations),
        "periods": len(periods),
        "geos": geos,
        "channels": {"paid": paid_channels, "organic": organic_channels, "searches": search_channels},
        "missing": missing,
    }


def _sign_request(raw_body: str, secret: str) -> tuple[str, str]:
    timestamp = str(int(time.time()))
    signature = hmac.new(secret.encode(), f"{timestamp}.{raw_body}".encode(), hashlib.sha256).hexdigest()
    return timestamp, signature


def _fetch_snapshot(request: AnalyzeRequest) -> list[Observation]:
    url = os.getenv("MMM_SNAPSHOT_URL", "").strip()
    secret = os.getenv("MMM_SNAPSHOT_SECRET", "")
    if not url or not secret:
        raise HTTPException(status_code=503, detail="A fonte segura do snapshot ainda não foi configurada.")
    payload = {"client_id": request.client_id}
    if request.start:
        payload["start"] = request.start.isoformat()
    if request.end:
        payload["end"] = request.end.isoformat()
    raw_body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    timestamp, signature = _sign_request(raw_body, secret)
    try:
        response = httpx.post(
            url,
            content=raw_body,
            headers={"content-type": "application/json", "x-mmm-timestamp": timestamp, "x-mmm-signature": signature},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        return [Observation.model_validate(item) for item in data.get("observations", [])[:MAX_OBSERVATIONS]]
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(status_code=502, detail="A fonte segura do snapshot não respondeu corretamente.") from error


def _load_observations(request: AnalyzeRequest) -> list[Observation]:
    if request.observations is not None:
        if os.getenv("MMM_ALLOW_INLINE_OBSERVATIONS", "false").lower() != "true":
            raise HTTPException(status_code=400, detail="Observações inline estão desativadas neste ambiente.")
        return _normalise_observations(request.observations[:MAX_OBSERVATIONS])
    return _normalise_observations(_fetch_snapshot(request))


@app.get("/health")
def health() -> dict[str, Any]:
    try:
        import meridian  # noqa: F401
        meridian_available = True
    except ImportError:
        meridian_available = False
    return {"ok": True, "service": "marketing-mix-model", "meridian_available": meridian_available, "min_periods": MIN_PERIODS}


@app.post("/v1/mmm/readiness")
def get_readiness(request: AnalyzeRequest, x_mmm_service_token: str | None = Header(default=None)) -> dict[str, Any]:
    _check_access(x_mmm_service_token)
    observations = _load_observations(request)
    return {"client_id": request.client_id, "readiness": readiness(observations)}


@app.post("/v1/mmm/analyze")
def analyze(request: AnalyzeRequest, x_mmm_service_token: str | None = Header(default=None)) -> dict[str, Any]:
    _check_access(x_mmm_service_token)
    observations = _load_observations(request)
    data_readiness = readiness(observations)
    if data_readiness["status"] != "ready":
        return {
            "status": "insufficient_data",
            "client_id": request.client_id,
            "readiness": data_readiness,
            "results": None,
            "message": "Ainda não há cobertura histórica suficiente para estimar ROI com segurança.",
        }
    if not request.run_model:
        return {
            "status": "ready_for_model",
            "client_id": request.client_id,
            "readiness": data_readiness,
            "results": None,
            "message": "Dados prontos. A execução do MCMC foi deixada desligada para esta validação.",
        }
    try:
        results = run_meridian(observations, request.kpi_type)
    except ImportError as error:
        return {"status": "model_unavailable", "client_id": request.client_id, "readiness": data_readiness, "results": None, "message": str(error)}
    except Exception as error:  # Model diagnostics are returned without exposing raw data.
        return {"status": "model_error", "client_id": request.client_id, "readiness": data_readiness, "results": None, "message": "O modelo não convergiu com os dados enviados; revise a cobertura e os controles."}
    return {"status": "completed", "client_id": request.client_id, "readiness": data_readiness, "results": results}
