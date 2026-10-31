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
