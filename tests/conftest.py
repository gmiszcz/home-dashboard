"""Test client with its own database and token. Secrets only in process environment variables."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import ExitStack
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

DEFAULT_ENV = {
    "DASHBOARD_TOKEN": "test-token-value",
    "READ_TOKEN": "",
    "RETENTION_DAYS": "",
    "LOG_LEVEL": "WARNING",
}


@pytest.fixture
def token() -> str:
    return "test-token-value"


@pytest.fixture
def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def make_client(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[Callable[..., TestClient]]:
    """Return a factory that starts an app with a fresh database and the given env overrides."""
    from app.config import get_settings

    stack = ExitStack()

    def factory(**env: str) -> TestClient:
        values = {**DEFAULT_ENV, "DB_PATH": str(tmp_path / "dashboard.sqlite"), **env}
        for name, value in values.items():
            monkeypatch.setenv(name, value)
        get_settings.cache_clear()
        from app.main import create_app

        return stack.enter_context(TestClient(create_app()))

    with stack:
        yield factory
    get_settings.cache_clear()


@pytest.fixture
def client(make_client: Callable[..., TestClient], token: str) -> TestClient:
    return make_client(DASHBOARD_TOKEN=token, MAX_BODY_BYTES="262144", STALE_AFTER_MINUTES="360")


@pytest.fixture
def read_client(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client(READ_TOKEN="read-token-value")


@pytest.fixture
def retention_client(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client(RETENTION_DAYS="7")


@pytest.fixture
def tiny_client(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client(MAX_BODY_BYTES="1024")
