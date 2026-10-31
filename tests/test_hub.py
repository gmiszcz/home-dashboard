"""ConnectionHub broadcast: concurrent sends and removal of stalled or broken sockets."""

from __future__ import annotations

import asyncio
import time
from typing import Any, cast

import pytest
from fastapi import WebSocket

from app.services import hub as hub_module
from app.services.hub import ConnectionHub


class FakeSocket:
    """Stands in for a WebSocket. The mode picks how send_json behaves."""

    def __init__(self, mode: str = "ok") -> None:
        self.mode = mode
        self.received: list[dict[str, Any]] = []
        self.is_closed = False

    async def accept(self) -> None:
        return None

    async def send_json(self, message: dict[str, Any]) -> None:
        if self.mode == "raise":
            raise RuntimeError("socket is gone")
        if self.mode == "hang":
            await asyncio.Event().wait()
        self.received.append(message)

    async def close(self) -> None:
        self.is_closed = True


async def connect_all(hub: ConnectionHub, sockets: list[FakeSocket]) -> None:
    for socket in sockets:
        await hub.connect(cast(WebSocket, socket))


def test_broadcast_reaches_healthy_socket_and_drops_bad_ones(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(hub_module, "SEND_TIMEOUT_SECONDS", 0.05)
    healthy, broken, stalled = FakeSocket(), FakeSocket("raise"), FakeSocket("hang")
    hub = ConnectionHub()

    async def scenario() -> float:
        await connect_all(hub, [healthy, broken, stalled])
        started = time.perf_counter()
        await hub.broadcast({"type": "update"})
        return time.perf_counter() - started

    elapsed = asyncio.run(scenario())

    assert healthy.received == [{"type": "update"}]
    assert elapsed < 1
    assert hub._sockets == {healthy}
    assert broken.is_closed
    assert stalled.is_closed
    assert not healthy.is_closed


def test_broadcast_without_clients_is_a_no_op() -> None:
    asyncio.run(ConnectionHub().broadcast({"type": "ping"}))
