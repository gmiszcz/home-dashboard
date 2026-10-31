"""Access log: successful health polls stay out of the INFO log."""

from __future__ import annotations

import logging

import pytest
from fastapi.testclient import TestClient


def test_health_poll_is_not_logged_at_info(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="app.middleware"):
        assert client.get("/api/health").status_code == 200
    assert [r for r in caplog.records if r.name == "app.middleware"] == []


def test_other_requests_are_logged_at_info(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="app.middleware"):
        assert client.get("/api/latest").status_code == 200
    messages = [r.getMessage() for r in caplog.records if r.name == "app.middleware"]
    assert any("/api/latest" in message for message in messages)


def test_streamed_body_over_limit_is_rejected(tiny_client: TestClient) -> None:
    chunks = (b"x" * 600 for _ in range(4))
    response = tiny_client.post(
        "/api/update",
        content=chunks,
        headers={"Authorization": "Bearer test-token-value"},
    )
    assert response.status_code == 413
    assert response.json()["detail"] == "Payload too large"


@pytest.mark.parametrize("path", ["/api/health", "/", "/api/latest"])
def test_security_headers_are_set_on_every_response(client: TestClient, path: str) -> None:
    response = client.get(path)
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "no-referrer"
