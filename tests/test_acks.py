"""Tests for acknowledgment endpoints and repository."""

from datetime import datetime

from fastapi.testclient import TestClient

from tests.helpers import envelope, warsaw


def test_post_ack_and_get_acks(client: TestClient) -> None:
    # Initially empty
    res = client.get("/api/acks")
    assert res.status_code == 200
    assert res.json() == {"acks": []}

    # Post an ack
    post_res = client.post(
        "/api/ack",
        json={"section": "security_alerts", "item_id": "sec-ipad-1"},
    )
    assert post_res.status_code == 200
    data = post_res.json()
    assert data["status"] == "ok"
    assert data["ack"]["section"] == "security_alerts"
    assert data["ack"]["item_id"] == "sec-ipad-1"
    assert "acked_at" in data["ack"]

    # Post a second ack in a different section
    client.post(
        "/api/ack",
        json={"section": "parcels", "item_id": "pkg-123"},
    )

    # List all
    all_acks = client.get("/api/acks").json()["acks"]
    assert len(all_acks) == 2
    item_ids = {a["item_id"] for a in all_acks}
    assert item_ids == {"sec-ipad-1", "pkg-123"}

    # Filter by section
    sec_acks = client.get("/api/acks?section=security_alerts").json()["acks"]
    assert len(sec_acks) == 1
    assert sec_acks[0]["item_id"] == "sec-ipad-1"


def test_ack_is_idempotent(client: TestClient) -> None:
    res1 = client.post("/api/ack", json={"section": "security_alerts", "item_id": "dup-1"})
    assert res1.status_code == 200
    res2 = client.post("/api/ack", json={"section": "security_alerts", "item_id": "dup-1"})
    assert res2.status_code == 200

    all_acks = client.get("/api/acks?section=security_alerts").json()["acks"]
    assert len(all_acks) == 1
    assert all_acks[0]["item_id"] == "dup-1"


def test_ack_validation(client: TestClient) -> None:
    bad1 = client.post("/api/ack", json={"section": "", "item_id": "id1"})
    assert bad1.status_code == 422
    bad2 = client.post("/api/ack", json={"section": "sec", "item_id": ""})
    assert bad2.status_code == 422
    bad3 = client.post("/api/ack", json={})
    assert bad3.status_code == 422


def test_get_section_acks_returns_only_that_section(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    client.post("/api/ack", json={"section": "ai_daily", "item_id": "a1"})
    client.post("/api/ack", json={"section": "ai_daily", "item_id": "a2"})
    client.post("/api/ack", json={"section": "promotions", "item_id": "p1"})

    res = client.get("/api/ack?section=ai_daily", headers=auth_header)
    assert res.status_code == 200
    body = res.json()
    assert body["section"] == "ai_daily"
    assert {a["item_id"] for a in body["acks"]} == {"a1", "a2"}
    assert all(a["section"] == "ai_daily" and a["acked_at"] for a in body["acks"])


def test_get_section_acks_empty_for_known_section(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    res = client.get("/api/ack?section=ai_weekly", headers=auth_header)
    assert res.status_code == 200
    assert res.json() == {"section": "ai_weekly", "acks": []}


def test_get_section_acks_validation(client: TestClient, auth_header: dict[str, str]) -> None:
    assert client.get("/api/ack", headers=auth_header).status_code == 422
    assert client.get("/api/ack?section=", headers=auth_header).status_code == 422
    assert client.get("/api/ack?section=nope", headers=auth_header).status_code == 422


def test_get_section_acks_requires_ingest_token(client: TestClient) -> None:
    assert client.get("/api/ack?section=ai_daily").status_code == 401
    bad = {"Authorization": "Bearer wrong"}
    assert client.get("/api/ack?section=ai_daily", headers=bad).status_code == 401


def test_get_section_acks_ignores_read_token(read_client: TestClient) -> None:
    read_header = {"Authorization": "Bearer read-token-value"}
    assert read_client.get("/api/ack?section=ai_daily", headers=read_header).status_code == 401
    ingest_header = {"Authorization": "Bearer test-token-value"}
    assert read_client.get("/api/ack?section=ai_daily", headers=ingest_header).status_code == 200


def test_unack_removes_only_the_given_mark(client: TestClient) -> None:
    for section, item_id in [
        ("ai_daily", "a"),
        ("ai_daily", "b"),
        ("ai_weekly", "a"),
    ]:
        client.post("/api/ack", json={"section": section, "item_id": item_id})

    res = client.delete("/api/ack", params={"section": "ai_daily", "item_id": "a"})
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "section": "ai_daily", "item_id": "a", "removed": True}

    remaining = {(a["section"], a["item_id"]) for a in client.get("/api/acks").json()["acks"]}
    assert remaining == {("ai_daily", "b"), ("ai_weekly", "a")}


def test_unack_is_idempotent(client: TestClient) -> None:
    res = client.delete("/api/ack", params={"section": "ai_daily", "item_id": "never-read"})
    assert res.status_code == 200
    assert res.json()["removed"] is False


def test_unack_validation(client: TestClient) -> None:
    assert client.delete("/api/ack", params={"section": "ai_daily"}).status_code == 422
    assert client.delete("/api/ack", params={"item_id": "a"}).status_code == 422
    assert client.delete("/api/ack", params={"section": "", "item_id": "a"}).status_code == 422


def test_unack_requires_read_token(read_client: TestClient) -> None:
    params = {"section": "ai_daily", "item_id": "a"}
    assert read_client.delete("/api/ack", params=params).status_code == 401
    header = {"Authorization": "Bearer read-token-value"}
    assert read_client.delete("/api/ack", params=params, headers=header).status_code == 200


def test_read_marks_survive_the_section_being_posted_again(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    items = [{"id": "ai-1", "headline": "Temat", "url": "https://news.example/1"}]
    first = envelope(section="ai_weekly", items=items)
    assert client.post("/api/update", json=first, headers=auth_header).status_code == 200
    client.post("/api/ack", json={"section": "ai_weekly", "item_id": "ai-1"})

    second = envelope(
        section="ai_weekly", generated_at=warsaw(datetime(2026, 10, 30, 8, 0)), items=items
    )
    assert client.post("/api/update", json=second, headers=auth_header).status_code == 200

    acks = client.get("/api/acks?section=ai_weekly").json()["acks"]
    assert [a["item_id"] for a in acks] == ["ai-1"]


def test_ack_and_unack_are_broadcast_over_websocket(client: TestClient) -> None:
    with client.websocket_connect("/ws") as websocket:
        assert websocket.receive_json()["type"] == "snapshot"

        client.post("/api/ack", json={"section": "ai_daily", "item_id": "ai-1"})
        marked = websocket.receive_json()
        assert marked["type"] == "ack"
        assert marked["data"]["section"] == "ai_daily"
        assert marked["data"]["item_id"] == "ai-1"

        client.delete("/api/ack", params={"section": "ai_daily", "item_id": "ai-1"})
        unmarked = websocket.receive_json()
        assert unmarked == {"type": "unack", "data": {"section": "ai_daily", "item_id": "ai-1"}}
