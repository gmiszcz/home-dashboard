"""Klient testowy z własną bazą i tokenem. Sekrety tylko w zmiennych procesu."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def token() -> str:
    return "test-token-value"


@pytest.fixture
def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client(tmp_path, monkeypatch, token: str) -> Iterator[TestClient]:
    monkeypatch.setenv("DASHBOARD_TOKEN", token)
    monkeypatch.setenv("DB_PATH", str(tmp_path / "dashboard.sqlite"))
    monkeypatch.setenv("READ_TOKEN", "")
    monkeypatch.setenv("RETENTION_DAYS", "")
    monkeypatch.setenv("MAX_BODY_BYTES", "262144")
    monkeypatch.setenv("STALE_AFTER_MINUTES", "360")
    monkeypatch.setenv("LOG_LEVEL", "WARNING")
    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import create_app

    application = create_app()
    with TestClient(application) as test_client:
        yield test_client
    get_settings.cache_clear()


@pytest.fixture
def read_client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setenv("DASHBOARD_TOKEN", "test-token-value")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "read.sqlite"))
    monkeypatch.setenv("READ_TOKEN", "read-token-value")
    monkeypatch.setenv("RETENTION_DAYS", "")
    monkeypatch.setenv("LOG_LEVEL", "WARNING")
    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import create_app

    application = create_app()
    with TestClient(application) as test_client:
        yield test_client
    get_settings.cache_clear()


@pytest.fixture
def retention_client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setenv("DASHBOARD_TOKEN", "test-token-value")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "retention.sqlite"))
    monkeypatch.setenv("READ_TOKEN", "")
    monkeypatch.setenv("RETENTION_DAYS", "7")
    monkeypatch.setenv("LOG_LEVEL", "WARNING")
    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import create_app

    application = create_app()
    with TestClient(application) as test_client:
        yield test_client
    get_settings.cache_clear()


@pytest.fixture
def tiny_client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setenv("DASHBOARD_TOKEN", "test-token-value")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "tiny.sqlite"))
    monkeypatch.setenv("READ_TOKEN", "")
    monkeypatch.setenv("MAX_BODY_BYTES", "1024")
    monkeypatch.setenv("LOG_LEVEL", "WARNING")
    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import create_app

    application = create_app()
    with TestClient(application) as test_client:
        yield test_client
    get_settings.cache_clear()
