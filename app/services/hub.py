"""Broadcasts new rows to open WebSockets."""

from fastapi import WebSocket

from app.logging_config import get_logger

logger = get_logger("dashboard.ws")


class ConnectionHub:
    def __init__(self) -> None:
        self._sockets: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._sockets.add(websocket)
        logger.info("websocket connected clients=%s", len(self._sockets))

    def disconnect(self, websocket: WebSocket) -> None:
        self._sockets.discard(websocket)
        logger.info("websocket disconnected clients=%s", len(self._sockets))

    async def broadcast(self, message: dict) -> None:
        dead: list[WebSocket] = []
        for websocket in list(self._sockets):
            try:
                await websocket.send_json(message)
            except Exception:
                logger.warning("websocket send failed", exc_info=True)
                dead.append(websocket)
        for websocket in dead:
            self.disconnect(websocket)
