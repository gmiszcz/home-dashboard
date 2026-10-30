"""Weather endpoint for Gliwice."""

from fastapi import APIRouter, HTTPException

from app.services.weather import WeatherUnavailableError, get_weather

router = APIRouter()


@router.get("/api/weather")
def weather() -> dict:
    try:
        return get_weather()
    except WeatherUnavailableError as exc:
        raise HTTPException(status_code=503, detail="Weather unavailable") from exc
