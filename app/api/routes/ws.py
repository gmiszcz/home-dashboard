"""WebSocket: migawka przy połączeniu, potem każdy nowy wiersz."""

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, WebSocketException, status

from app.auth import bearer_token, tokens_match
from app.config import get_settings
from app.logging_config import get_logger

router = APIRouter()
logger = get_logger("dashboard.ws")

HEARTBEAT_SECONDS = 25


@router.websocket("/ws")
async def stream(websocket: WebSocket) -> None:
    settings = get_settings()
    if settings.read_token:
        query_token = websocket.query_params.get("token")
        candidate = (query_token.strip() if query_token else None) or bearer_token(
            websocket.headers.get("authorization")
        )
        if not tokens_match(candidate, settings.read_token):
            raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized")

    hub = websocket.app.state.hub
    service = websocket.app.state.service
    await hub.connect(websocket)
    try:
        await websocket.send_json({"type": "snapshot", "data": service.latest()})
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=HEARTBEAT_SECONDS)
            except TimeoutError:
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        logger.debug("websocket client closed")
    finally:
        hub.disconnect(websocket)
