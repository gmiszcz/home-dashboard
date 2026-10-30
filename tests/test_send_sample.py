"""The random sample generator must produce payloads the dashboard accepts."""

import importlib.util
import json
import random
from datetime import datetime
from pathlib import Path
from types import ModuleType

import pytest
from fastapi.testclient import TestClient

from tests.helpers import WARSAW

ROOT = Path(__file__).resolve().parents[1]


def _load_script() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "send_sample", ROOT / "scripts" / "send_sample.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load scripts/send_sample.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


send_sample = _load_script()


@pytest.mark.parametrize("seed", range(20))
def test_random_pool_payloads_are_accepted(
    client: TestClient, auth_header: dict[str, str], seed: int
) -> None:
    rng = random.Random(seed)
    now = datetime.now(WARSAW).replace(microsecond=0)
    for path in sorted((ROOT / "samples" / "pool").glob("*.json")):
        pool = json.loads(path.read_text(encoding="utf-8"))
        message = send_sample.random_message(pool, now, rng)
        response = client.post("/api/update", json=message, headers=auth_header)
        assert response.status_code == 200, (path.name, response.text)


def test_calendar_layout_buckets_events_by_warsaw_date() -> None:
    now = datetime(2026, 10, 30, 16, 0, tzinfo=WARSAW)
    events = [
        {"id": "today", "start": "2026-10-30T18:00:00+01:00"},
        {"id": "tomorrow-all-day", "start": "2026-10-31"},
        {"id": "after-midnight", "start": "2026-10-31T23:30:00+00:00"},
        {"id": "week", "start": "2026-11-05T09:00:00+01:00"},
        {"id": "too-late", "start": "2026-11-09T09:00:00+01:00"},
    ]
    layout = send_sample.calendar_layout(events, now)

    assert layout["layout"] == "days_plus_week"
    assert [day["date"] for day in layout["days"]] == ["2026-10-30", "2026-10-31", "2026-11-01"]
    assert [day["label"] for day in layout["days"]] == ["Dziś", "Jutro", "Pojutrze"]
    assert [[event["id"] for event in day["events"]] for day in layout["days"]] == [
        ["today"],
        ["tomorrow-all-day"],
        ["after-midnight"],
    ]
    assert layout["week"]["from"] == "2026-11-02"
    assert layout["week"]["to"] == "2026-11-08"
    assert [event["id"] for event in layout["week"]["events"]] == ["week"]
    assert layout["items"] == []
