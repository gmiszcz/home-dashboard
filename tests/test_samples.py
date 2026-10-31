"""Every file in samples/ must pass validation and be stored."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.schemas.sections import KNOWN_SECTIONS

ROOT = Path(__file__).resolve().parents[1]
# One static sample per known section, so the samples preview every tile.
EXPECTED = set(KNOWN_SECTIONS)


SAMPLE_FILES = sorted((ROOT / "samples").glob("*.json"))


def test_samples_cover_every_known_section() -> None:
    assert {path.stem for path in SAMPLE_FILES} == EXPECTED


@pytest.mark.parametrize("path", SAMPLE_FILES, ids=lambda path: path.stem)
def test_sample_payload_is_accepted(
    path: Path, client: TestClient, auth_header: dict[str, str]
) -> None:
    payload = json.loads(path.read_text(encoding="utf-8"))
    response = client.post("/api/update", json=payload, headers=auth_header)
    assert response.status_code == 200
    latest = client.get("/api/latest").json()["sections"]
    assert [row["section"] for row in latest] == [path.stem]


def test_parcels_sample_keeps_pickup_code_on_first_item_only(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    payload = json.loads((ROOT / "samples" / "parcels.json").read_text(encoding="utf-8"))
    assert client.post("/api/update", json=payload, headers=auth_header).status_code == 200
    parcels = client.get("/api/latest").json()["sections"][0]
    assert parcels["source"] == "porz-dki-w-skrzynce"
    assert parcels["items"][0]["pickup_code"] == "482913"
    assert "pickup_code" not in parcels["items"][1]
