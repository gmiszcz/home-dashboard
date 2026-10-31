"""Envelopes used in tests. Timestamps always carry the Europe/Warsaw offset."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

WARSAW = ZoneInfo("Europe/Warsaw")


def warsaw(moment: datetime | None = None) -> str:
    value = moment or datetime(2026, 10, 29, 16, 0, tzinfo=WARSAW)
    if value.tzinfo is None:
        value = value.replace(tzinfo=WARSAW)
    return value.astimezone(WARSAW).replace(microsecond=0).isoformat(timespec="seconds")


def envelope(
    section: str = "parcels", generated_at: str | None = None, **extra: object
) -> dict[str, Any]:
    payload = {
        "schema_version": 1,
        "section": section,
        "generated_at": generated_at or warsaw(),
        "source": "test",
        "title": "Przesyłki",
        "summary": "1 paczka czeka na odbiór",
        "items": [
            {
                "id": "p1",
                "title": "Słuchawki",
                "status": "ready_for_pickup",
                "carrier": "InPost",
                "shop": "Sklep Przykład",
                "deadline": warsaw(datetime(2026, 10, 31, 18, 0, tzinfo=WARSAW)),
            }
        ],
        "extra": {},
    }
    payload.update(extra)
    return payload


def days_ago(days: int) -> str:
    return warsaw(datetime.now(WARSAW) - timedelta(days=days))
