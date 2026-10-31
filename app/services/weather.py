"""Fetches and caches the Open-Meteo forecast for Gliwice."""

from __future__ import annotations

import json
import logging
import time
import urllib.request
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

GLIWICE_LAT = 50.2976
GLIWICE_LON = 18.6766
TIMEZONE = "Europe/Warsaw"
CACHE_TTL_SECONDS = 900  # 15 minutes

_cache: dict[str, Any] = {}
_cache_time: float = 0


class WeatherUnavailableError(RuntimeError):
    """Raised when the forecast cannot be fetched and nothing is cached."""


# WMO weather codes grouped by (Polish condition label shown on screen, icon name).
_WEATHER_GROUPS: tuple[tuple[tuple[int, ...], str, str], ...] = (
    ((0,), "Bezchmurnie", "sun"),
    ((1, 2), "Częściowo pochmurno", "cloud-sun"),
    ((3,), "Pochmurno", "cloud"),
    ((45, 48), "Mgła", "fog"),
    ((51, 53, 55), "Mżawka", "drizzle"),
    ((56, 57), "Marznąca mżawka", "sleet"),
    ((61, 63, 65), "Deszcz", "rain"),
    ((66, 67), "Marznący deszcz", "sleet"),
    ((71, 73, 75, 77), "Śnieg", "snow"),
    ((80, 81, 82), "Przelotny deszcz", "rain-showers"),
    ((85, 86), "Przelotny śnieg", "snow"),
    ((95, 96, 99), "Burza", "thunderstorm"),
)
WEATHER_CODES: dict[int, tuple[str, str]] = {
    code: (label, icon) for codes, label, icon in _WEATHER_GROUPS for code in codes
}
DEFAULT_CONDITION = ("Umiarkowanie", "cloud-sun")


def map_weather_code(code: int) -> tuple[str, str]:
    """Returns (Polish condition label shown on screen, icon name) for a WMO code."""
    return WEATHER_CODES.get(code, DEFAULT_CONDITION)


def fetch_weather_from_open_meteo() -> dict[str, Any]:
    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={GLIWICE_LAT}&longitude={GLIWICE_LON}"
        f"&current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m"
        f"&hourly=temperature_2m,weather_code,precipitation_probability"
        f"&timezone={TIMEZONE}&forecast_days=2"
    )
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "HomeDashboard/1.0 (pi@home-dashboard)"},
    )
    # The URL is a fixed https constant, so the urlopen scheme warning does not apply.
    with urllib.request.urlopen(req, timeout=8) as response:  # nosec B310
        return json.loads(response.read().decode("utf-8"))


def get_weather() -> dict[str, Any]:
    global _cache, _cache_time
    now_ts = time.time()

    if _cache and (now_ts - _cache_time < CACHE_TTL_SECONDS):
        return _cache

    try:
        raw = fetch_weather_from_open_meteo()
        tz = ZoneInfo(TIMEZONE)
        now_dt = datetime.now(tz)

        curr_raw = raw.get("current", {})
        curr_temp = round(curr_raw.get("temperature_2m", 0))
        curr_code = int(curr_raw.get("weather_code", 0))
        curr_condition, curr_icon = map_weather_code(curr_code)

        hourly_raw = raw.get("hourly", {})
        times = hourly_raw.get("time", [])
        temps = hourly_raw.get("temperature_2m", [])
        codes = hourly_raw.get("weather_code", [])
        pops = hourly_raw.get("precipitation_probability", [])

        # Pick upcoming hours in 3-hour steps (e.g. at 07:15 -> 09:00, 12:00, 15:00, 18:00, 21:00)
        upcoming_items: list[dict[str, Any]] = []

        for idx, t_str in enumerate(times):
            try:
                dt = datetime.fromisoformat(t_str).replace(tzinfo=tz)
            except (TypeError, ValueError):
                continue

            # Future hours only (at least 30 minutes from now)
            diff_hours = (dt - now_dt).total_seconds() / 3600.0
            if diff_hours < 0.5:
                continue

            # Full hours in 3-hour steps (or close to them)
            hour = dt.hour
            if hour in (8, 12, 15, 18, 21) or (
                diff_hours >= 1.5 and len(upcoming_items) < 5 and (dt.hour % 3 == 0)
            ):
                h_code = int(codes[idx]) if idx < len(codes) else 0
                _, h_icon = map_weather_code(h_code)
                h_temp = round(temps[idx]) if idx < len(temps) else curr_temp
                h_pop = int(pops[idx]) if idx < len(pops) and pops[idx] is not None else 0

                upcoming_items.append(
                    {
                        "time": dt.strftime("%H:00"),
                        "temp": h_temp,
                        "code": h_code,
                        "icon": h_icon,
                        "pop": h_pop,
                    }
                )

            if len(upcoming_items) >= 5:
                break

        # Fallback when the filter yields too few slots: take every 3rd hour
        if len(upcoming_items) < 4:
            for idx, t_str in enumerate(times):
                dt = datetime.fromisoformat(t_str).replace(tzinfo=tz)
                diff_hours = (dt - now_dt).total_seconds() / 3600.0
                if diff_hours >= 1.0 and dt.hour % 3 == 0:
                    h_code = int(codes[idx]) if idx < len(codes) else 0
                    _, h_icon = map_weather_code(h_code)
                    item = {
                        "time": dt.strftime("%H:00"),
                        "temp": round(temps[idx]),
                        "code": h_code,
                        "icon": h_icon,
                        "pop": int(pops[idx]) if idx < len(pops) and pops[idx] is not None else 0,
                    }
                    if not any(u["time"] == item["time"] for u in upcoming_items):
                        upcoming_items.append(item)
                if len(upcoming_items) >= 5:
                    break

        _cache = {
            "city": "Gliwice",
            "current": {
                "temp": curr_temp,
                "code": curr_code,
                "condition": curr_condition,
                "icon": curr_icon,
            },
            "hourly": upcoming_items[:5],
            "updated_at": now_dt.isoformat(),
        }
        _cache_time = now_ts
        return _cache
    except Exception as exc:
        logger.warning("error=<%s> | weather fetch failed", exc, exc_info=True)
        if _cache:
            return _cache
        raise WeatherUnavailableError("weather unavailable") from exc
