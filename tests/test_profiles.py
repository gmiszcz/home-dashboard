"""Tile `profiles` field and the section-profiles map."""

from __future__ import annotations

from datetime import datetime

from fastapi.testclient import TestClient

from tests.helpers import WARSAW, envelope, warsaw


def _at(hour: int) -> str:
    return warsaw(datetime(2026, 11, 2, hour, 0, tzinfo=WARSAW))


def test_profiles_field_is_stored_and_a_missing_field_stays_absent(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    shared = envelope(section="calendar", profiles=["ola", "patryk"], items=[])
    assert client.post("/api/update", json=shared, headers=auth_header).status_code == 200
    row = next(
        item
        for item in client.get("/api/latest").json()["sections"]
        if item["section"] == "calendar"
    )
    assert row["profiles"] == ["ola", "patryk"]

    plain = envelope(section="parcels", generated_at=_at(11))
    assert client.post("/api/update", json=plain, headers=auth_header).status_code == 200
    parcels = next(
        item
        for item in client.get("/api/latest").json()["sections"]
        if item["section"] == "parcels"
    )
    assert "profiles" not in parcels


def test_profiles_field_rejects_unknown_empty_and_duplicate_values(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    for profiles in (["zenek"], [], ["patryk", "patryk"], ["patryk", "ola", "ola"], None, "ola"):
        payload = envelope(section="notes", generated_at=_at(12), profiles=profiles, items=[])
        assert client.post("/api/update", json=payload, headers=auth_header).status_code == 422

    kept = client.get("/api/latest").json()["sections"]
    assert all(row["section"] != "notes" for row in kept)


def test_section_profiles_replace_and_require_the_ingest_token(
    read_client: TestClient, auth_header: dict[str, str]
) -> None:
    assert read_client.get("/api/section-profiles").status_code == 401
    denied_body = {"sections": {"job_offers": ["ola"]}}
    assert read_client.put("/api/section-profiles", json=denied_body).status_code == 401

    screen = {"Authorization": "Bearer read-token-value"}
    assert read_client.get("/api/section-profiles", headers=screen).json() == {"sections": {}}
    denied = read_client.put("/api/section-profiles", json=denied_body, headers=screen)
    assert denied.status_code == 401

    invalid = read_client.put(
        "/api/section-profiles",
        json={"sections": {"a/b": ["ola"], "  ": ["patryk"], "job_offers": []}},
        headers=auth_header,
    )
    assert invalid.status_code == 422

    stored = read_client.put(
        "/api/section-profiles",
        json={
            "sections": {
                "job_offers": ["ola"],
                "calendar": ["ola", "patryk"],
                " family_events ": ["patryk"],
            }
        },
        headers=auth_header,
    )
    assert stored.status_code == 200
    assert stored.json() == {
        "sections": {
            "calendar": ["patryk", "ola"],
            "family_events": ["patryk"],
            "job_offers": ["ola"],
        }
    }

    replaced = read_client.put(
        "/api/section-profiles",
        json={"sections": {"parcels": ["patryk", "ola"]}},
        headers=auth_header,
    )
    assert replaced.json() == {"sections": {"parcels": ["patryk", "ola"]}}
    assert read_client.get("/api/section-profiles", headers=auth_header).json() == {
        "sections": {"parcels": ["patryk", "ola"]}
    }

    cleared = read_client.put("/api/section-profiles", json={"sections": {}}, headers=auth_header)
    assert cleared.json() == {"sections": {}}


def test_section_profiles_broadcast(client: TestClient, auth_header: dict[str, str]) -> None:
    with client.websocket_connect("/ws") as websocket:
        assert websocket.receive_json()["type"] == "snapshot"
        client.put(
            "/api/section-profiles",
            json={"sections": {"inbox_cleanup": ["ola"]}},
            headers=auth_header,
        )
        event = websocket.receive_json()
        assert event == {
            "type": "section-profiles",
            "data": {"sections": {"inbox_cleanup": ["ola"]}},
        }
