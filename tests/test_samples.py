"""Każdy plik w samples/ musi przejść walidację i zostać dopisany."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    "ai_daily",
    "ai_weekly",
    "calendar",
    "email_digest",
    "expenses_weekly",
    "finance",
    "github_weekly",
    "inbox_cleanup",
    "parcels",
    "prices",
    "promotions",
    "subscriptions",
}


def test_sample_payloads_are_accepted(client: TestClient, auth_header: dict[str, str]) -> None:
    files = sorted((ROOT / "samples").glob("*.json"))
    assert {path.stem for path in files} == EXPECTED
    for path in files:
        payload = json.loads(path.read_text(encoding="utf-8"))
        response = client.post("/api/update", json=payload, headers=auth_header)
        assert response.status_code == 200, path.name
    latest = client.get("/api/latest").json()["sections"]
    assert {row["section"] for row in latest} == EXPECTED
    parcels = next(row for row in latest if row["section"] == "parcels")
    assert parcels["source"] == "porz-dki-w-skrzynce"
    assert parcels["items"][0]["pickup_code"] == "482913"
    assert "pickup_code" not in parcels["items"][1]
