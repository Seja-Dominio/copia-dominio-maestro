import hashlib
import hmac
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi.testclient import TestClient

import bridge_api


def _post_signed(client, endpoint, secret):
    body = json.dumps({
        "maestro_session_token": "short-lived-test-token",
        "maestro_endpoint": endpoint,
        "question": "consulta de teste",
    }, separators=(",", ":")).encode()
    timestamp = str(int(time.time()))
    signature = hmac.new(
        secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256
    ).hexdigest()
    return client.post(
        "/v1/respond",
        content=body,
        headers={
            "x-dominus-bridge-timestamp": timestamp,
            "x-dominus-bridge-signature": signature,
            "content-type": "application/json",
        },
    )


def test_only_operator_allowlisted_endpoint_reaches_hermes(monkeypatch, tmp_path):
    secret = "test-bridge-secret"
    allowed_endpoint = "https://dev-project.supabase.co"
    monkeypatch.setattr(bridge_api, "BRIDGE_SECRET", secret)
    monkeypatch.setattr(bridge_api, "MAESTRO_ENDPOINTS", {allowed_endpoint})
    monkeypatch.setattr(bridge_api, "RUN_DIR", tmp_path)
    monkeypatch.setattr(bridge_api, "SESSION_FILE", tmp_path / "maestro-session.json")

    def inspect_session(_prompt):
        session = json.loads(bridge_api.SESSION_FILE.read_text())
        assert session["endpoint"] == allowed_endpoint
        assert session["token"] == "short-lived-test-token"
        return "consulta concluída"

    monkeypatch.setattr(bridge_api, "_run_hermes", inspect_session)
    client = TestClient(bridge_api.app)

    allowed = _post_signed(client, allowed_endpoint, secret)
    assert allowed.status_code == 200
    assert allowed.json()["text"] == "consulta concluída"
    assert not bridge_api.SESSION_FILE.exists()

    def unexpected_hermes_call(_prompt):
        raise AssertionError("endpoint não permitido não deve iniciar o Hermes")

    monkeypatch.setattr(bridge_api, "_run_hermes", unexpected_hermes_call)
    for endpoint in ("https://attacker.invalid", "file:///etc/passwd"):
        rejected = _post_signed(client, endpoint, secret)
        assert rejected.status_code == 400
        assert not bridge_api.SESSION_FILE.exists()
