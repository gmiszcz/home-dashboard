"""Limit rozmiaru ciała żądania i krótki log dostępu bez query stringa (tam bywa token)."""

import time

from starlette.responses import JSONResponse

from app.logging_config import get_logger

logger = get_logger("dashboard.http")


class BodyLimitMiddleware:
    def __init__(self, app, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        raw_length = headers.get(b"content-length")
        if raw_length:
            try:
                if int(raw_length) > self.max_bytes:
                    response = JSONResponse({"detail": "Payload too large"}, status_code=413)
                    await response(scope, receive, send)
                    return
            except ValueError:
                pass

        body = bytearray()
        more = True
        while more:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            if message["type"] != "http.request":
                continue
            body.extend(message.get("body", b""))
            more = message.get("more_body", False)
            if len(body) > self.max_bytes:
                while more:
                    extra = await receive()
                    if extra["type"] == "http.disconnect":
                        return
                    more = extra.get("more_body", False)
                response = JSONResponse({"detail": "Payload too large"}, status_code=413)
                await response(scope, receive, send)
                return

        sent = False

        async def cached_receive():
            nonlocal sent
            if sent:
                return {"type": "http.request", "body": b"", "more_body": False}
            sent = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.app(scope, cached_receive, send)


class AccessLogMiddleware:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = time.perf_counter()
        status = 0

        async def send_wrapper(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = int(message["status"])
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.info(
                "%s %s -> %s %.1fms",
                scope.get("method"),
                scope.get("path"),
                status,
                elapsed_ms,
            )
