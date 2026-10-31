"""Combines the HTTP and WebSocket routes."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import acks, health, updates, weather, ws

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(weather.router, tags=["weather"])
api_router.include_router(updates.router, tags=["updates"])
api_router.include_router(acks.router, tags=["acks"])
api_router.include_router(ws.router, tags=["ws"])
