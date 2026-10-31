"""Validation of the days_plus_week calendar layout."""

from __future__ import annotations

import copy
import json
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.helpers import envelope

ROOT = Path(__file__).resolve().parents[1]


def calendar_payload() -> dict:
    return envelope(
        section="calendar",
        title="Kalendarz",
        summary="Dziś 1 wydarzenie",
        items=[],
        layout="days_plus_week",
        days=[
            {
                "date": "2026-10-30",
                "label": "Dziś",
                "events": [
                    {
                        "id": "evt-123",
                        "title": "Wydarzenie testowe",
                        "start": "2026-10-30T00:00:00+01:00",
                        "end": None,
                        "all_day": True,
                        "location": None,
                        "calendar": "Dom",
                        "provider": "icloud",
                        "color": "#4CD964",
                        "priority": "normal",
                        "simple": True,
                    }
                ],
            },
            {"date": "2026-10-31", "label": "Jutro", "events": []},
            {"date": "2026-11-01", "label": "Pojutrze", "events": []},
        ],
        week={
            "from": "2026-11-02",
            "to": "2026-11-08",
            "events": [
                {
                    "id": "evt-456",
                    "title": "Szczepienie",
                    "start": "2026-11-04T08:00:00+01:00",
                    "all_day": False,
                    "calendar": "Rodzina",
                    "provider": "google",
                    "priority": "high",
                    "simple": False,
                }
            ],
        },
        display={"collapsed": False, "max_visible": 1, "simple": True},
    )


def test_calendar_layout_is_accepted_and_stored(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    response = client.post("/api/update", json=calendar_payload(), headers=auth_header)
    assert response.status_code == 200

    row = client.get("/api/latest").json()["sections"][0]
    assert row["layout"] == "days_plus_week"
    assert [day["label"] for day in row["days"]] == ["Dziś", "Jutro", "Pojutrze"]
    assert row["days"][0]["events"][0]["provider"] == "icloud"
    assert row["week"]["events"][0]["start"] == "2026-11-04T08:00:00+01:00"


def test_docs_example_batch_is_accepted(client: TestClient, auth_header: dict[str, str]) -> None:
    payload = json.loads((ROOT / "docs" / "example.json").read_text(encoding="utf-8"))
    response = client.post("/api/updates", json=payload, headers=auth_header)
    assert response.status_code == 200, response.text
    sections = {row["section"] for row in client.get("/api/latest").json()["sections"]}
    assert sections == {message["section"] for message in payload["messages"]}
    assert {"family_events", "allegro_watch", "security_alerts", "expenses_weekly"} <= sections
    for message in payload["messages"]:
        single = client.post("/api/update", json=message, headers=auth_header)
        assert single.status_code == 200, (message["section"], single.text)


def test_calendar_items_payload_still_accepted(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    payload = envelope(
        section="calendar",
        items=[{"id": "e1", "title": "Dentysta", "start": "2026-10-30T09:40:00+01:00"}],
    )
    assert client.post("/api/update", json=payload, headers=auth_header).status_code == 200


def _week_event_outside_range(payload: dict) -> None:
    payload["week"]["events"][0]["start"] = "2026-11-20T08:00:00+01:00"


def _event_in_wrong_day(payload: dict) -> None:
    payload["days"][1]["events"] = [copy.deepcopy(payload["days"][0]["events"][0])]


def _unknown_provider(payload: dict) -> None:
    payload["days"][0]["events"][0]["provider"] = "outlook"


def _bad_color(payload: dict) -> None:
    payload["days"][0]["events"][0]["color"] = "green"


def _missing_start(payload: dict) -> None:
    del payload["week"]["events"][0]["start"]


def _naive_start(payload: dict) -> None:
    payload["week"]["events"][0]["start"] = "2026-11-04T08:00:00"


def _bad_day_date(payload: dict) -> None:
    payload["days"][0]["date"] = "30.10.2026"


def _week_reversed(payload: dict) -> None:
    payload["week"]["from"], payload["week"]["to"] = "2026-11-08", "2026-11-02"


def _unknown_layout(payload: dict) -> None:
    payload["layout"] = "month"


def _days_not_list(payload: dict) -> None:
    payload["days"] = {"date": "2026-10-30"}


def _too_many_days(payload: dict) -> None:
    payload["days"] = [{"date": "2026-10-30", "events": []}] * 8


def _all_day_not_bool(payload: dict) -> None:
    payload["days"][0]["events"][0]["all_day"] = "yes"


@pytest.mark.parametrize(
    "mutate",
    [
        _week_event_outside_range,
        _event_in_wrong_day,
        _unknown_provider,
        _bad_color,
        _missing_start,
        _naive_start,
        _bad_day_date,
        _week_reversed,
        _unknown_layout,
        _days_not_list,
        _too_many_days,
        _all_day_not_bool,
    ],
)
def test_calendar_layout_rejects_invalid_payloads(
    client: TestClient, auth_header: dict[str, str], mutate: Callable[[dict], None]
) -> None:
    payload = calendar_payload()
    mutate(payload)
    assert client.post("/api/update", json=payload, headers=auth_header).status_code == 422


def test_calendar_layout_ignored_for_other_sections(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    payload = envelope(days="not validated here")
    assert client.post("/api/update", json=payload, headers=auth_header).status_code == 200
