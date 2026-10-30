"""Weather endpoint for Gliwice."""

from fastapi import APIRouter

from app.services.weather import get_weather

router = APIRouter()


@router.get("/api/weather")
def weather() -> dict:
    return get_weather()
