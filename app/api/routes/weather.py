"""Weather endpoint for Gliwice."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.services.weather import WeatherUnavailableError, get_weather

router = APIRouter()


@router.get("/api/weather")
def weather() -> dict[str, Any]:
    try:
        return get_weather()
    except WeatherUnavailableError as exc:
        raise HTTPException(status_code=503, detail="Weather unavailable") from exc
