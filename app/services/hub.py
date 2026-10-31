"""Broadcasts new rows to open WebSockets."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# A stalled iPad (sleeping Safari, dead Wi-Fi) must not block the broadcast for long.
SEND_TIMEOUT_SECONDS = 5


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

    async def _send(self, websocket: WebSocket, message: dict[str, Any]) -> None:
        """Sends to one socket. On error or timeout the socket is dropped and closed."""

        try:
            await asyncio.wait_for(websocket.send_json(message), timeout=SEND_TIMEOUT_SECONDS)
        except Exception:
            logger.warning(
                "clients=<%s> | websocket send failed, dropping client",
                len(self._sockets),
                exc_info=True,
            )
            self.disconnect(websocket)
            # The client reconnects on its own once the socket is closed.
            with contextlib.suppress(Exception):
                await asyncio.wait_for(websocket.close(), timeout=SEND_TIMEOUT_SECONDS)

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Sends the message to every open socket at once, so one slow client cannot stall the rest."""

        await asyncio.gather(*(self._send(websocket, message) for websocket in list(self._sockets)))
