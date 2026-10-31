"""Request body size limit and a short access log without the query string (it may hold a token)."""

from __future__ import annotations

import logging
import time

from starlette.requests import ClientDisconnect
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)


async def _read_body(receive: Receive, max_bytes: int) -> bytes | None:
    """Reads the whole request body, or returns None when it exceeds max_bytes.

    The rest of an oversized body is still consumed, so the client can finish its upload.

    Raises:
        ClientDisconnect: The client closed the connection before the body was complete.
    """

    body = bytearray()
    is_exceeded = False
    more = True
    while more:
        message = await receive()
        if message["type"] == "http.disconnect":
            raise ClientDisconnect
        if message["type"] != "http.request":
            continue
        more = message.get("more_body", False)
        if not is_exceeded:
            body.extend(message.get("body", b""))
            is_exceeded = len(body) > max_bytes
    return None if is_exceeded else bytes(body)


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    def _declared_too_large(self, scope: Scope) -> bool:
        """Returns True when the Content-Length header alone exceeds the limit."""

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        raw_length = headers.get(b"content-length")
        if not raw_length:
            return False
        try:
            return int(raw_length) > self.max_bytes
        except ValueError:
            logger.debug(
                "content_length=<%s> | malformed header, streaming limit applies", raw_length
            )
            return False

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return

        body: bytes | None = None
        if not self._declared_too_large(scope):
            try:
                body = await _read_body(receive, self.max_bytes)
            except ClientDisconnect:
                return
        if body is None:
            response = JSONResponse({"detail": "Payload too large"}, status_code=413)
            await response(scope, receive, send)
            return

        sent = False

        async def cached_receive() -> Message:
            nonlocal sent
            if sent:
                return {"type": "http.request", "body": b"", "more_body": False}
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, cached_receive, send)


class AccessLogMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = time.perf_counter()
        status = 0

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = int(message["status"])
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            elapsed_ms = (time.perf_counter() - started) * 1000
            # Health polls (iPad and Docker healthcheck) would fill the SD card with INFO lines
            is_health_ok = scope.get("path") == "/api/health" and status < 400
            logger.log(
                logging.DEBUG if is_health_ok else logging.INFO,
                "method=<%s>, path=<%s>, status=<%s>, elapsed_ms=<%.1f> | request handled",
                scope.get("method"),
                scope.get("path"),
                status,
                elapsed_ms,
            )
