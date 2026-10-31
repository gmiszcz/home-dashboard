"""Ingest token, read token and the body size limit."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.auth import is_read_authorized
from app.config import Settings
from tests.helpers import envelope


def test_missing_and_bad_token_are_rejected(client: TestClient) -> None:
    payload = envelope()
    missing = client.post("/api/update", json=payload)
    assert missing.status_code == 401
    assert missing.json()["detail"] == "Unauthorized"

    wrong = client.post(
        "/api/update",
        json=payload,
        headers={"Authorization": "Bearer not-the-token"},
    )
    assert wrong.status_code == 401

    basic = client.post(
        "/api/update",
        json=payload,
        headers={"Authorization": "Basic dGVzdA=="},
    )
    assert basic.status_code == 401


def test_valid_token_is_accepted(client: TestClient, auth_header: dict[str, str]) -> None:
    response = client.post("/api/update", json=envelope(), headers=auth_header)
    assert response.status_code == 200
    assert response.json()["id"] == 1


def test_read_token_guards_reads_and_not_health(read_client: TestClient) -> None:
    open_health = read_client.get("/api/health")
    assert open_health.status_code == 200

    blocked = read_client.get("/api/latest")
    assert blocked.status_code == 401

    blocked_acks = read_client.get("/api/acks")
    assert blocked_acks.status_code == 401

    blocked_ack_post = read_client.post(
        "/api/ack", json={"section": "security_alerts", "item_id": "test"}
    )
    assert blocked_ack_post.status_code == 401

    header = {"Authorization": "Bearer read-token-value"}
    allowed = read_client.get("/api/latest", headers=header)
    assert allowed.status_code == 200

    allowed_acks = read_client.get("/api/acks", headers=header)
    assert allowed_acks.status_code == 200

    allowed_ack_post = read_client.post(
        "/api/ack", json={"section": "security_alerts", "item_id": "test"}, headers=header
    )
    assert allowed_ack_post.status_code == 200

    by_query = read_client.get("/api/latest", params={"token": "read-token-value"})
    assert by_query.status_code == 200

    write = read_client.post(
        "/api/update",
        json=envelope(),
        headers={"Authorization": "Bearer test-token-value"},
    )
    assert write.status_code == 200
    hidden = read_client.get("/api/latest")
    assert hidden.status_code == 401
    visible = read_client.get("/api/section/parcels", headers=header)
    assert visible.status_code == 200
    assert len(visible.json()["updates"]) == 1


def test_payload_too_large(tiny_client: TestClient) -> None:
    response = tiny_client.post(
        "/api/update",
        json=envelope(summary="x" * 2000),
        headers={"Authorization": "Bearer test-token-value"},
    )
    assert response.status_code == 413
    assert response.json()["detail"] == "Payload too large"


READ_SETTINGS = Settings(
    _env_file=None, dashboard_token="ingest-token-value", read_token="read-token"
)


@pytest.mark.parametrize(
    ("authorization", "token", "expected"),
    [
        ("Bearer read-token", None, True),
        (None, "read-token", True),
        ("Bearer read-token", "wrong", True),
        ("Bearer wrong", "read-token", False),
        (None, None, False),
        ("Basic read-token", None, False),
        (None, "  ", False),
    ],
    ids=[
        "header-only",
        "query-only",
        "header-wins",
        "bad-header-no-fallback",
        "missing",
        "wrong-scheme",
        "blank-query",
    ],
)
def test_is_read_authorized_prefers_header_over_query(
    authorization: str | None, token: str | None, expected: bool
) -> None:
    assert is_read_authorized(READ_SETTINGS, authorization, token) is expected


def test_is_read_authorized_is_open_without_read_token() -> None:
    open_settings = Settings(_env_file=None, dashboard_token="ingest-token-value", read_token="")
    assert is_read_authorized(open_settings) is True
