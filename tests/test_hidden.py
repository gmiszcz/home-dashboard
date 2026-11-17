"""Hidden offers (Ukryj) and the concealed-tile list."""

from __future__ import annotations

from datetime import datetime

from fastapi.testclient import TestClient

from tests.helpers import WARSAW, envelope, warsaw
from tests.test_exclusions import _offer


def _at(hour: int) -> str:
    return warsaw(datetime(2026, 11, 1, hour, 0, tzinfo=WARSAW))


def _ids(client: TestClient, section: str = "gabinety") -> list[str]:
    rows = client.get("/api/latest").json()["sections"]
    match = next(row for row in rows if row["section"] == section)
    return [item["id"] for item in match["items"]]


def test_hide_is_idempotent_and_lists_by_section(client: TestClient) -> None:
    empty = client.get("/api/hidden", params={"section": "gabinety"})
    assert empty.status_code == 200
    assert empty.json() == {"section": "gabinety", "items": []}

    created = client.post(
        "/api/hidden",
        json={
            "section": "gabinety",
            "id": "g1",
            "url": "https://example.com/g1",
            "title": "Gabinet",
        },
    )
    assert created.status_code == 200
    body = created.json()
    assert body["status"] == "ok"
    assert body["section"] == "gabinety"
    assert body["item"]["id"] == "g1"
    assert body["item"]["url"] == "https://example.com/g1"
    assert body["item"]["title"] == "Gabinet"
    assert body["item"]["hidden_at"]

    again = client.post(
        "/api/hidden",
        json={"section": "gabinety", "id": "g1", "title": "Gabinet, nowa nazwa"},
    )
    assert again.status_code == 200
    assert again.json()["item"]["title"] == "Gabinet, nowa nazwa"
    assert again.json()["item"]["url"] == "https://example.com/g1"

    client.post("/api/hidden", json={"section": "domki", "id": "d1", "title": "Domek"})
    one = client.get("/api/hidden", params={"section": "gabinety"}).json()
    assert [item["id"] for item in one["items"]] == ["g1"]

    all_sections = client.get("/api/hidden").json()
    assert [group["section"] for group in all_sections["sections"]] == ["domki", "gabinety"]


def test_restore_hidden_is_idempotent(client: TestClient) -> None:
    client.post("/api/hidden", json={"section": "gabinety", "id": "g1"})
    removed = client.delete("/api/hidden", params={"section": "gabinety", "id": "g1"})
    assert removed.status_code == 200
    assert removed.json() == {
        "status": "ok",
        "section": "gabinety",
        "id": "g1",
        "removed": True,
    }
    assert client.get("/api/hidden", params={"section": "gabinety"}).json()["items"] == []

    missing = client.delete("/api/hidden", params={"section": "gabinety", "id": "g1"})
    assert missing.status_code == 200
    assert missing.json()["removed"] is False


def test_hidden_validation(client: TestClient) -> None:
    assert client.post("/api/hidden", json={"section": "gabinety"}).status_code == 422
    assert client.post("/api/hidden", json={"id": "g1"}).status_code == 422
    assert client.post("/api/hidden", json={"section": "a/b", "id": "g1"}).status_code == 422
    assert client.get("/api/hidden", params={"section": "a/b"}).status_code == 422
    assert (
        client.delete("/api/hidden", params={"section": "gabinety", "id": " "}).status_code == 422
    )


def test_served_tile_drops_hidden_offers_and_keeps_not_interested(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    assert (
        client.post(
            "/api/update", json=_offer(generated_at=_at(10)), headers=auth_header
        ).status_code
        == 200
    )
    client.post(
        "/api/exclusions",
        json={"section": "gabinety", "offer_id": "keep", "title": "Zostaje"},
    )
    client.post(
        "/api/hidden",
        json={
            "section": "gabinety",
            "id": "drop",
            "url": "https://example.com/drop",
            "title": "Znika",
        },
    )
    assert _ids(client) == ["keep"]

    resent = _offer(
        generated_at=_at(12),
        items=[
            {"id": "keep", "title": "Zostaje", "url": "https://example.com/keep"},
            {"id": "drop", "title": "Znika znowu", "url": "https://example.com/drop-2"},
            {"id": "same-url", "title": "Ten sam link", "url": "https://example.com/drop"},
            {"id": "fresh", "title": "Nowa", "url": "https://example.com/fresh"},
        ],
    )
    assert client.post("/api/update", json=resent, headers=auth_header).status_code == 200
    assert _ids(client) == ["keep", "fresh"]

    ack = client.get("/api/ack", params={"section": "gabinety"}, headers=auth_header)
    assert ack.status_code == 200
    body = ack.json()
    assert [item["offer_id"] for item in body["not_interested"]] == ["keep"]
    assert [item["id"] for item in body["hidden"]] == ["drop"]
    assert "keep" not in {item["id"] for item in body["hidden"]}

    restored = client.delete("/api/hidden", params={"section": "gabinety", "id": "drop"})
    assert restored.json()["removed"] is True
    assert _ids(client) == ["keep", "drop", "same-url", "fresh"]


def test_hidden_broadcasts_the_filtered_tile(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    with client.websocket_connect("/ws") as websocket:
        assert websocket.receive_json()["type"] == "snapshot"
        assert client.post("/api/update", json=_offer(), headers=auth_header).status_code == 200
        posted = websocket.receive_json()
        assert [item["id"] for item in posted["data"]["items"]] == ["keep", "drop"]

        client.post("/api/hidden", json={"section": "gabinety", "id": "drop", "title": "Znika"})
        event = websocket.receive_json()
        assert event["type"] == "hidden"
        assert event["data"]["id"] == "drop"
        refreshed = websocket.receive_json()
        assert refreshed["type"] == "update"
        assert [item["id"] for item in refreshed["data"]["items"]] == ["keep"]

        client.delete("/api/hidden", params={"section": "gabinety", "id": "drop"})
        assert websocket.receive_json()["type"] == "unhidden"
        back = websocket.receive_json()
        assert [item["id"] for item in back["data"]["items"]] == ["keep", "drop"]


def test_hidden_tokens(read_client: TestClient, auth_header: dict[str, str]) -> None:
    assert read_client.get("/api/hidden").status_code == 401
    assert (
        read_client.post("/api/hidden", json={"section": "gabinety", "id": "g1"}).status_code == 401
    )

    ingest = read_client.post(
        "/api/hidden",
        json={"section": "gabinety", "id": "g1", "title": "Z CLI"},
        headers=auth_header,
    )
    assert ingest.status_code == 200
    screen = {"Authorization": "Bearer read-token-value"}
    listed = read_client.get("/api/hidden", params={"section": "gabinety"}, headers=screen)
    assert listed.status_code == 200
    assert listed.json()["items"][0]["id"] == "g1"


def test_hidden_sections_replace_and_require_the_ingest_token(
    read_client: TestClient, auth_header: dict[str, str]
) -> None:
    assert read_client.get("/api/hidden-sections").status_code == 401
    assert read_client.post("/api/hidden-sections", json={"sections": ["prad"]}).status_code == 401

    screen = {"Authorization": "Bearer read-token-value"}
    assert read_client.get("/api/hidden-sections", headers=screen).json() == {"sections": []}
    denied = read_client.put("/api/hidden-sections", json={"sections": ["prad"]}, headers=screen)
    assert denied.status_code == 401

    stored = read_client.post(
        "/api/hidden-sections",
        json={"sections": ["prad", "payslip", "prad", "  "]},
        headers=auth_header,
    )
    assert stored.status_code == 422

    stored = read_client.post(
        "/api/hidden-sections",
        json={"sections": ["prad", "payslip", "prad"]},
        headers=auth_header,
    )
    assert stored.status_code == 200
    assert stored.json() == {"sections": ["payslip", "prad"]}

    replaced = read_client.put(
        "/api/hidden-sections",
        json={"sections": ["czynsz"]},
        headers=auth_header,
    )
    assert replaced.json() == {"sections": ["czynsz"]}
    assert read_client.get("/api/hidden-sections", headers=auth_header).json() == {
        "sections": ["czynsz"]
    }

    cleared = read_client.post("/api/hidden-sections", json={"sections": []}, headers=auth_header)
    assert cleared.json() == {"sections": []}


def test_hidden_sections_broadcast(client: TestClient, auth_header: dict[str, str]) -> None:
    with client.websocket_connect("/ws") as websocket:
        assert websocket.receive_json()["type"] == "snapshot"
        client.put(
            "/api/hidden-sections",
            json={"sections": ["inbox_cleanup"]},
            headers=auth_header,
        )
        event = websocket.receive_json()
        assert event == {"type": "hidden-sections", "data": {"sections": ["inbox_cleanup"]}}


def test_payload_hidden_flag_is_stored(client: TestClient, auth_header: dict[str, str]) -> None:
    payload = envelope(section="aquarium", hidden=True, items=[])
    assert client.post("/api/update", json=payload, headers=auth_header).status_code == 200
    row = client.get("/api/latest").json()["sections"][0]
    assert row["hidden"] is True
    assert row["section"] == "aquarium"

    rejected = envelope(section="aquarium", generated_at=_at(12), hidden="yes", items=[])
    assert client.post("/api/update", json=rejected, headers=auth_header).status_code == 422
