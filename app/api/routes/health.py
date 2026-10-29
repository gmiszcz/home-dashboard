"""Sonda życia. Bez tokenu, bez danych z podsumowań."""

from fastapi import APIRouter, Request

from app.config import get_settings
from app.logging_config import get_logger

router = APIRouter()
logger = get_logger("dashboard.health")


@router.get("/api/health")
def health(request: Request) -> dict:
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
    }
