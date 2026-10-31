"""Liveness probe. No token, no summary data."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Request

from app import __version__
from app.config import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/api/health")
def health(request: Request) -> dict[str, Any]:
    settings = get_settings()
    db_status = "ok"
    updates = 0
    try:
        updates = request.app.state.service.count()
    except Exception:
        logger.exception("health check failed")
        db_status = "error"
    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "db": db_status,
        "updates": updates,
        "stale_after_minutes": settings.stale_after_minutes,
        "server_id": getattr(request.app.state, "server_id", "unknown"),
        "version": __version__,
    }
