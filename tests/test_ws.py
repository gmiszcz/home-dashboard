"""Snapshot on connect and broadcast of a new row."""

from fastapi.testclient import TestClient

from tests.helpers import envelope, warsaw


def test_websocket_snapshot_and_broadcast(client: TestClient, auth_header: dict[str, str]) -> None:
    with client.websocket_connect("/ws") as websocket:
        snapshot = websocket.receive_json()
        assert snapshot == {"type": "snapshot", "data": []}

        created = client.post("/api/update", json=envelope(), headers=auth_header)
        assert created.status_code == 200
        event = websocket.receive_json()
        assert event["type"] == "update"
        assert event["data"]["id"] == created.json()["id"]
        assert event["data"]["section"] == "parcels"
        assert event["data"]["summary"] == "1 paczka czeka na odbiór"

        duplicate = client.post("/api/update", json=envelope(), headers=auth_header)
        assert duplicate.json()["id"] == created.json()["id"]


def test_websocket_batch_broadcasts_each_new_row(
    client: TestClient, auth_header: dict[str, str]
) -> None:
    body = {
        "schema_version": 1,
        "sent_at": warsaw(),
        "messages": [
            envelope(section="ai_daily", title="AI dziś", items=[]),
            envelope(section="ai_weekly", title="AI tydzień", items=[]),
        ],
    }
    with client.websocket_connect("/ws") as websocket:
        assert websocket.receive_json()["type"] == "snapshot"
        response = client.post("/api/updates", json=body, headers=auth_header)
        assert response.status_code == 200
        kinds = []
        sections = set()
        for _ in range(2):
            event = websocket.receive_json()
            kinds.append(event["type"])
            sections.add(event["data"]["section"])
        assert kinds == ["update", "update"]
        assert sections == {"ai_daily", "ai_weekly"}


def test_websocket_requires_read_token(read_client: TestClient) -> None:
    from starlette.websockets import WebSocketDisconnect

    try:
        with read_client.websocket_connect("/ws") as websocket:
            websocket.receive_json()
            raise AssertionError("expected the socket to reject a missing read token")
    except WebSocketDisconnect as exc:
        assert exc.code in {1008, 1000, 1011}

    with read_client.websocket_connect("/ws?token=read-token-value") as websocket:
        message = websocket.receive_json()
        assert message["type"] == "snapshot"


def test_uvicorn_has_websocket_support() -> None:
    # uvicorn sets this to None when neither websockets nor wsproto is installed.
    # TestClient does not need it, but the real server on the Pi does.
    from uvicorn.protocols.websockets.auto import AutoWebSocketsProtocol

    assert AutoWebSocketsProtocol is not None
