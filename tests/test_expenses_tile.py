"""Generic expenses tiles: any section name, chosen by renderer or type."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from tests.helpers import envelope

ROOT = Path(__file__).resolve().parents[1]


def _tile(**extra: object) -> dict[str, object]:
    payload = envelope(
        section="rachunki",
        title="Rachunki",
        summary="Listopad",
        items=[],
        renderer="expenses",
        period="2026-11",
        total=120.5,
        currency="PLN",
        blocks=[{"type": "note", "text": "Brak nowych opłat."}],
    )
    payload.update(extra)
    return payload


def test_samples_are_accepted(client: TestClient, auth_header: dict[str, str]) -> None:
    for name in ("tauron_expenses", "czynsz"):
        payload = json.loads((ROOT / "samples" / f"{name}.json").read_text(encoding="utf-8"))
        response = client.post("/api/update", json=payload, headers=auth_header)
        assert response.status_code == 200, response.text


def test_type_expenses_accepts_blocks_on_any_section(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    payload = _tile(renderer=None, type="expenses")
    payload.pop("renderer")
    assert client.post("/api/update", json=payload, headers=auth_header).status_code == 200
    row = client.get("/api/latest").json()["sections"][0]
    assert row["type"] == "expenses"
    assert row["blocks"][0]["type"] == "note"
    assert row["total"] == 120.5


def test_expenses_tile_rejects_a_broken_block(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    missing = _tile()
    missing.pop("blocks")
    assert client.post("/api/update", json=missing, headers=auth_header).status_code == 422

    bad_type = _tile(blocks=[{"type": "pie", "text": "nope"}])
    assert client.post("/api/update", json=bad_type, headers=auth_header).status_code == 422

    short_series = _tile(
        blocks=[
            {
                "type": "bars",
                "labels": ["I", "II"],
                "series": [{"name": "kWh", "values": [1]}],
            }
        ]
    )
    assert client.post("/api/update", json=short_series, headers=auth_header).status_code == 422

    bad_status = _tile(blocks=[{"type": "list", "items": [{"label": "Faktura", "status": "PAID"}]}])
    assert client.post("/api/update", json=bad_status, headers=auth_header).status_code == 422

    bad_tone = _tile(
        blocks=[{"type": "kpi", "items": [{"label": "Saldo", "value": "1", "tone": "red"}]}]
    )
    assert client.post("/api/update", json=bad_tone, headers=auth_header).status_code == 422

    bad_drill = _tile(
        blocks=[
            {
                "type": "drilldown",
                "labels": ["I", "II"],
                "items": [{"id": "a", "label": "A", "series": [1]}],
            }
        ]
    )
    assert client.post("/api/update", json=bad_drill, headers=auth_header).status_code == 422


def test_other_sections_ignore_the_expenses_rules(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    payload = envelope()
    assert client.post("/api/update", json=payload, headers=auth_header).status_code == 200
