"""Broadcasts new rows to open WebSockets."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionHub:
    def __init__(self) -> None:
        self._sockets: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._sockets.add(websocket)
        logger.info("clients=<%s> | websocket connected", len(self._sockets))

    def disconnect(self, websocket: WebSocket) -> None:
        self._sockets.discard(websocket)
        logger.info("clients=<%s> | websocket disconnected", len(self._sockets))

    async def broadcast(self, message: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for websocket in list(self._sockets):
            try:
                await websocket.send_json(message)
            except Exception:
                logger.warning(
                    "clients=<%s> | websocket send failed", len(self._sockets), exc_info=True
                )
                dead.append(websocket)
        for websocket in dead:
            self.disconnect(websocket)
