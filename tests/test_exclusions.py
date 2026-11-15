"""Hidden offers: the exclusions API and filtering them out of served tiles."""

from __future__ import annotations

from datetime import datetime

from fastapi.testclient import TestClient

from tests.helpers import WARSAW, envelope, warsaw


def _at(hour: int) -> str:
    return warsaw(datetime(2026, 11, 1, hour, 0, tzinfo=WARSAW))


def _offer(section: str = "gabinety", **extra: object) -> dict[str, object]:
    payload = envelope(
        section=section,
        title="Gabinety",
        summary="2 oferty",
        items=[
            {
                "id": "keep",
                "title": "Zostaje",
                "url": "https://example.com/keep",
                "price": "100 zł",
            },
            {
                "id": "drop",
                "title": "Znika",
                "url": "https://example.com/drop",
                "price": "200 zł",
            },
        ],
        renderer="offers",
    )
    payload.update(extra)
    return payload


def _ids(client: TestClient, section: str = "gabinety") -> list[str]:
    rows = client.get("/api/latest").json()["sections"]
    match = next(row for row in rows if row["section"] == section)
    return [item["id"] for item in match["items"]]


def test_exclude_is_idempotent_and_lists_by_section(client: TestClient) -> None:
    empty = client.get("/api/exclusions", params={"section": "gabinety"})
    assert empty.status_code == 200
    assert empty.json() == {"section": "gabinety", "items": []}

    created = client.post(
        "/api/exclusions",
        json={
            "section": "gabinety",
            "offer_id": "g1",
            "url": "https://example.com/g1",
            "title": "Gabinet",
        },
    )
    assert created.status_code == 200
    body = created.json()
    assert body["status"] == "ok"
    assert body["section"] == "gabinety"
    assert body["item"]["offer_id"] == "g1"
    assert body["item"]["url"] == "https://example.com/g1"
    assert body["item"]["title"] == "Gabinet"
    assert body["item"]["excluded_at"]

    again = client.post(
        "/api/exclusions",
        json={"section": "gabinety", "offer_id": "g1", "title": "Gabinet, nowa nazwa"},
    )
    assert again.status_code == 200
    assert again.json()["item"]["title"] == "Gabinet, nowa nazwa"
    assert again.json()["item"]["url"] == "https://example.com/g1"

    client.post(
        "/api/exclusions",
        json={"section": "domki", "offer_id": "d1", "title": "Domek"},
    )
    one = client.get("/api/exclusions", params={"section": "gabinety"}).json()
    assert [item["offer_id"] for item in one["items"]] == ["g1"]
    assert one["items"][0]["url"] == "https://example.com/g1"

    all_sections = client.get("/api/exclusions").json()
    assert [group["section"] for group in all_sections["sections"]] == ["domki", "gabinety"]
    assert all_sections["sections"][0]["items"][0]["offer_id"] == "d1"


def test_restore_is_idempotent(client: TestClient) -> None:
    client.post("/api/exclusions", json={"section": "gabinety", "offer_id": "g1"})
    removed = client.delete("/api/exclusions", params={"section": "gabinety", "offer_id": "g1"})
    assert removed.status_code == 200
    assert removed.json() == {
        "status": "ok",
        "section": "gabinety",
        "offer_id": "g1",
        "removed": True,
    }
    assert client.get("/api/exclusions", params={"section": "gabinety"}).json()["items"] == []

    missing = client.delete("/api/exclusions", params={"section": "gabinety", "offer_id": "g1"})
    assert missing.status_code == 200
    assert missing.json()["removed"] is False


def test_exclusion_validation(client: TestClient) -> None:
    assert client.post("/api/exclusions", json={"section": "gabinety"}).status_code == 422
    assert client.post("/api/exclusions", json={"offer_id": "g1"}).status_code == 422
    assert (
        client.post("/api/exclusions", json={"section": "a/b", "offer_id": "g1"}).status_code == 422
    )
    assert client.get("/api/exclusions", params={"section": "a/b"}).status_code == 422
    assert client.get("/api/exclusions", params={"section": ""}).status_code == 422
    assert (
        client.delete("/api/exclusions", params={"section": "gabinety", "offer_id": ""}).status_code
        == 422
    )


def test_unknown_section_lists_as_empty(client: TestClient) -> None:
    res = client.get("/api/exclusions", params={"section": "wynajem"})
    assert res.status_code == 200
    assert res.json() == {"section": "wynajem", "items": []}


def test_served_tile_drops_excluded_offers_by_id_and_by_url(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    created = client.post("/api/update", json=_offer(generated_at=_at(10)), headers=auth_header)
    assert created.status_code == 200
    assert _ids(client) == ["keep", "drop"]

    hidden = client.post(
        "/api/exclusions",
        json={
            "section": "gabinety",
            "offer_id": "drop",
            "url": "https://example.com/drop",
            "title": "Znika",
        },
    )
    assert hidden.status_code == 200
    assert _ids(client) == ["keep"]

    # A later push repeats the excluded offer and adds one that only shares its url.
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

    restored = client.delete("/api/exclusions", params={"section": "gabinety", "offer_id": "drop"})
    assert restored.json()["removed"] is True
    # The stored push still has both the old id and the url twin, so both come back.
    assert _ids(client) == ["keep", "drop", "same-url", "fresh"]


def test_legacy_gabinety_and_domki_are_normalized_and_filtered(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    legacy = envelope(
        section="gabinety",
        title="Gabinety",
        summary="",
        subtitle="Podnajem na ten tydzień",
        items=[
            {
                "id": "old-1",
                "nazwa": "Gabinet na Zwycięstwa",
                "link": "https://example.com/stary",
                "cena": 1800,
                "lokalizacja": "Gliwice",
                "opis": "Dwa dni w tygodniu",
            }
        ],
    )
    assert client.post("/api/update", json=legacy, headers=auth_header).status_code == 200
    row = next(
        item
        for item in client.get("/api/latest").json()["sections"]
        if item["section"] == "gabinety"
    )
    assert row["renderer"] == "offers"
    assert row["summary"] == "Podnajem na ten tydzień"
    offer = row["items"][0]
    assert offer["title"] == "Gabinet na Zwycięstwa"
    assert offer["url"] == "https://example.com/stary"
    assert offer["price"] == "1800"
    assert offer["location"] == "Gliwice"
    assert offer["description"] == "Dwa dni w tygodniu"
    assert offer["nazwa"] == "Gabinet na Zwycięstwa"

    # The old link is enough to hide a later copy that uses a new id.
    client.post(
        "/api/exclusions",
        json={
            "section": "gabinety",
            "offer_id": "old-1",
            "url": "https://example.com/stary",
        },
    )
    renamed = envelope(
        section="domki",
        title="Domki",
        items=[
            {
                "id": "cabin",
                "nazwa": "Chatka",
                "link": "https://example.com/chatka",
                "cena": "400 zł",
            }
        ],
    )
    assert client.post("/api/update", json=renamed, headers=auth_header).status_code == 200
    latest = {row["section"]: row for row in client.get("/api/latest").json()["sections"]}
    assert latest["gabinety"]["items"] == []
    assert latest["gabinety"]["renderer"] == "offers"
    assert latest["domki"]["renderer"] == "offers"
    assert latest["domki"]["items"][0]["title"] == "Chatka"
    assert latest["domki"]["items"][0]["price"] == "400 zł"


def test_non_offer_sections_are_not_filtered(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    assert client.post("/api/update", json=envelope(), headers=auth_header).status_code == 200
    client.post(
        "/api/exclusions",
        json={"section": "parcels", "offer_id": "p1", "url": "https://example.com/p"},
    )
    row = next(
        item
        for item in client.get("/api/latest").json()["sections"]
        if item["section"] == "parcels"
    )
    assert [item["id"] for item in row["items"]] == ["p1"]
    assert "renderer" not in row


def test_new_section_is_an_offer_tile_only_with_the_renderer(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    plain = envelope(
        section="wynajem",
        title="Wynajem",
        items=[{"id": "w1", "title": "Mieszkanie", "url": "https://example.com/w"}],
    )
    assert client.post("/api/update", json=plain, headers=auth_header).status_code == 200
    client.post(
        "/api/exclusions",
        json={"section": "wynajem", "offer_id": "w1", "url": "https://example.com/w"},
    )
    # Without the renderer the row is not an offer tile, so the exclusion does not strip it.
    plain_row = next(
        item
        for item in client.get("/api/latest").json()["sections"]
        if item["section"] == "wynajem"
    )
    assert [item["id"] for item in plain_row["items"]] == ["w1"]

    marked = envelope(
        section="wynajem",
        generated_at=_at(12),
        title="Wynajem",
        renderer="offers",
        items=[
            {"id": "w1", "title": "Mieszkanie", "url": "https://example.com/w"},
            {"id": "w2", "title": "Kawalerka", "url": "https://example.com/w2"},
        ],
    )
    assert client.post("/api/update", json=marked, headers=auth_header).status_code == 200
    row = next(
        item
        for item in client.get("/api/latest").json()["sections"]
        if item["section"] == "wynajem"
    )
    assert row["renderer"] == "offers"
    assert [item["id"] for item in row["items"]] == ["w2"]


def test_exclusion_tokens(read_client: TestClient, auth_header: dict[str, str]) -> None:
    assert read_client.get("/api/exclusions").status_code == 401
    assert (
        read_client.post(
            "/api/exclusions", json={"section": "gabinety", "offer_id": "g1"}
        ).status_code
        == 401
    )

    ingest = read_client.post(
        "/api/exclusions",
        json={"section": "gabinety", "offer_id": "g1", "title": "Z CLI"},
        headers=auth_header,
    )
    assert ingest.status_code == 200
    listed = read_client.get("/api/exclusions", params={"section": "gabinety"}, headers=auth_header)
    assert listed.status_code == 200
    assert listed.json()["items"][0]["offer_id"] == "g1"

    screen = {"Authorization": "Bearer read-token-value"}
    assert read_client.get("/api/exclusions", headers=screen).status_code == 200
    removed = read_client.delete(
        "/api/exclusions",
        params={"section": "gabinety", "offer_id": "g1"},
        headers=screen,
    )
    assert removed.status_code == 200
    assert removed.json()["removed"] is True

    assert (
        read_client.get(
            "/api/exclusions", headers={"Authorization": "Bearer not-the-token"}
        ).status_code
        == 401
    )


def test_exclusion_broadcasts_the_filtered_tile(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    with client.websocket_connect("/ws") as websocket:
        assert websocket.receive_json()["type"] == "snapshot"
        assert client.post("/api/update", json=_offer(), headers=auth_header).status_code == 200
        posted = websocket.receive_json()
        assert posted["type"] == "update"
        assert [item["id"] for item in posted["data"]["items"]] == ["keep", "drop"]

        client.post(
            "/api/exclusions",
            json={"section": "gabinety", "offer_id": "drop", "title": "Znika"},
        )
        event = websocket.receive_json()
        assert event["type"] == "exclusion"
        assert event["data"]["offer_id"] == "drop"
        refreshed = websocket.receive_json()
        assert refreshed["type"] == "update"
        assert [item["id"] for item in refreshed["data"]["items"]] == ["keep"]

        client.delete("/api/exclusions", params={"section": "gabinety", "offer_id": "drop"})
        restored_event = websocket.receive_json()
        assert restored_event["type"] == "unexclusion"
        assert restored_event["data"]["offer_id"] == "drop"
        back = websocket.receive_json()
        assert [item["id"] for item in back["data"]["items"]] == ["keep", "drop"]
