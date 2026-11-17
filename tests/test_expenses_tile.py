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
    for name in ("tauron_expenses", "czynsz", "saldo"):
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

    signed = _tile(
        blocks=[
            {
                "type": "bars",
                "labels": ["sty", "lut"],
                "sign_tone": True,
                "show_values": True,
                "series": [
                    {
                        "name": "Saldo",
                        "values": [-531, {"value": 151, "tone": "good"}],
                        "tones": ["bad", None],
                    }
                ],
            }
        ]
    )
    assert client.post("/api/update", json=signed, headers=auth_header).status_code == 200

    views = _tile(
        show_total=False,
        default_view="saldo",
        views=[
            {"id": "raty", "label": "Raty", "blocks": ["raty", 2]},
            {"id": "saldo", "label": "Saldo", "blocks": [1]},
        ],
        blocks=[
            {
                "type": "kpi",
                "hero": {
                    "label": "Nadpłata",
                    "value": "1 813,04 zł",
                    "tone": "good",
                    "lines": [
                        {"text": "starcza na ~1,5 raty"},
                        {"text": "−1 245,82 zł vs 31.10", "tone": "bad"},
                    ],
                },
            },
            {"id": "saldo", "type": "bars", "labels": ["I"], "series": [{"values": [-10]}]},
            {"id": "raty", "type": "bars", "labels": ["I"], "series": [{"values": [1]}]},
            {
                "type": "diff",
                "items": [{"label": "Media", "value": "82 zł", "delta": -3, "tone": "auto"}],
            },
        ],
    )
    assert client.post("/api/update", json=views, headers=auth_header).status_code == 200

    bad_view = _tile(
        generated_at="2026-11-17T21:20:00+01:00",
        views=[{"id": "raty", "label": "Raty", "blocks": ["missing"]}],
        blocks=[{"type": "note", "text": "ok"}],
    )
    assert client.post("/api/update", json=bad_view, headers=auth_header).status_code == 422

    bad_bar_tone = _tile(
        generated_at="2026-11-17T21:10:00+01:00",
        blocks=[
            {
                "type": "bars",
                "labels": ["sty"],
                "series": [{"values": [-1], "tones": ["red"]}],
            }
        ],
    )
    assert client.post("/api/update", json=bad_bar_tone, headers=auth_header).status_code == 422

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

    many = [
        {"id": f"c{index}", "label": f"C{index}", "series": [index, index + 1]}
        for index in range(15)
    ]
    accepted = _tile(blocks=[{"type": "drilldown", "labels": ["I", "II"], "items": many}])
    assert client.post("/api/update", json=accepted, headers=auth_header).status_code == 200

    too_many = many + [
        {"id": f"x{index}", "label": f"X{index}", "series": [1, 2]} for index in range(26)
    ]
    rejected = _tile(
        generated_at="2026-11-17T21:00:00+01:00",
        blocks=[{"type": "drilldown", "labels": ["I", "II"], "items": too_many}],
    )
    assert client.post("/api/update", json=rejected, headers=auth_header).status_code == 422


def test_other_sections_ignore_the_expenses_rules(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    payload = envelope()
    assert client.post("/api/update", json=payload, headers=auth_header).status_code == 200
