"""Weather endpoint with a mocked Open-Meteo. No test touches the network."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app.services import weather


def open_meteo_payload() -> dict[str, Any]:
    """Current block plus 48 hourly entries starting at the current Warsaw hour."""

    start = datetime.now(ZoneInfo("Europe/Warsaw")).replace(minute=0, second=0, microsecond=0)
    times = [(start + timedelta(hours=offset)).strftime("%Y-%m-%dT%H:%M") for offset in range(48)]
    return {
        "current": {"temperature_2m": 11.6, "weather_code": 3},
        "hourly": {
            "time": times,
            "temperature_2m": [10.0 + offset * 0.1 for offset in range(48)],
            "weather_code": [3] * 48,
            "precipitation_probability": [30] * 48,
        },
    }


@pytest.fixture(autouse=True)
def fresh_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(weather, "_cache", {})
    monkeypatch.setattr(weather, "_cache_time", 0)


def stub_fetcher(
    monkeypatch: pytest.MonkeyPatch, behaviour: Callable[[], dict[str, Any]]
) -> list[int]:
    calls: list[int] = []

    def fake() -> dict[str, Any]:
        calls.append(1)
        return behaviour()

    monkeypatch.setattr(weather, "fetch_weather_from_open_meteo", fake)
    return calls


def failing_fetch() -> dict[str, Any]:
    raise OSError("network down")


def test_weather_endpoint_returns_forecast(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    stub_fetcher(monkeypatch, open_meteo_payload)
    response = client.get("/api/weather")
    assert response.status_code == 200
    data = response.json()
    assert data["city"] == "Gliwice"
    assert data["current"]["condition"] == "Pochmurno"
    assert data["current"]["temp"] == 12
    assert 1 <= len(data["hourly"]) <= 5
    for slot in data["hourly"]:
        assert set(slot) == {"time", "temp", "code", "icon", "pop"}


def test_weather_returns_503_when_unreachable_and_not_cached(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    stub_fetcher(monkeypatch, failing_fetch)
    response = client.get("/api/weather")
    assert response.status_code == 503


def test_weather_serves_cached_forecast_when_refresh_fails(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = {"fail": False}

    def behaviour() -> dict[str, Any]:
        return failing_fetch() if state["fail"] else open_meteo_payload()

    stub_fetcher(monkeypatch, behaviour)
    first = client.get("/api/weather")
    assert first.status_code == 200

    monkeypatch.setattr(weather, "_cache_time", 0)
    state["fail"] = True
    second = client.get("/api/weather")
    assert second.status_code == 200
    assert second.json() == first.json()


def test_weather_second_call_within_ttl_uses_cache(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = stub_fetcher(monkeypatch, open_meteo_payload)
    assert client.get("/api/weather").status_code == 200
    assert client.get("/api/weather").status_code == 200
    assert len(calls) == 1
