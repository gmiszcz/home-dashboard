"""WebSocket: a snapshot on connect, then every new row."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, WebSocketException, status
from starlette.concurrency import run_in_threadpool

from app.auth import is_read_authorized
from app.config import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)

HEARTBEAT_SECONDS = 25


@router.websocket("/ws")
async def stream(websocket: WebSocket) -> None:
    is_allowed = is_read_authorized(
        get_settings(),
        websocket.headers.get("authorization"),
        websocket.query_params.get("token"),
    )
    if not is_allowed:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized")

    hub = websocket.app.state.hub
    service = websocket.app.state.service
    await hub.connect(websocket)
    try:
        snapshot = await run_in_threadpool(service.latest)
        await websocket.send_json({"type": "snapshot", "data": snapshot})
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=HEARTBEAT_SECONDS)
            except TimeoutError:
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        logger.debug("websocket client closed")
    finally:
        hub.disconnect(websocket)
