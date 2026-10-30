"""Pobieranie i cache prognozy pogody z Open-Meteo dla Gliwic."""

from datetime import datetime, timezone
import json
import logging
import time
import urllib.request
from typing import Any
from zoneinfo import ZoneInfo

logger = logging.getLogger("dashboard.weather")

GLIWICE_LAT = 50.2976
GLIWICE_LON = 18.6766
TIMEZONE = "Europe/Warsaw"
CACHE_TTL_SECONDS = 900  # 15 minut

_cache: dict[str, Any] = {}
_cache_time: float = 0


def map_weather_code(code: int) -> tuple[str, str]:
    """Zwraca (stan po polsku, nazwa ikony) dla kodu WMO."""
    if code == 0:
        return "Bezchmurnie", "sun"
    if code in (1, 2):
        return "Częściowo pochmurno", "cloud-sun"
    if code == 3:
        return "Pochmurno", "cloud"
    if code in (45, 48):
        return "Mgła", "fog"
    if code in (51, 53, 55):
        return "Mżawka", "drizzle"
    if code in (56, 57):
        return "Marznąca mżawka", "sleet"
    if code in (61, 63, 65):
        return "Deszcz", "rain"
    if code in (66, 67):
        return "Marznący deszcz", "sleet"
    if code in (71, 73, 75, 77):
        return "Śnieg", "snow"
    if code in (80, 81, 82):
        return "Przelotny deszcz", "rain-showers"
    if code in (85, 86):
        return "Przelotny śnieg", "snow"
    if code in (95, 96, 99):
        return "Burza", "thunderstorm"
    return "Umiarkowanie", "cloud-sun"


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
    with urllib.request.urlopen(req, timeout=8) as response:
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

        # Wybór nadchodzących godzin co 3h (np. jeśli teraz 07:15 -> 09:00, 12:00, 15:00, 18:00, 21:00)
        upcoming_items = []
        target_hours = {8, 11, 12, 14, 15, 17, 18, 20, 21, 23}

        for idx, t_str in enumerate(times):
            try:
                dt = datetime.fromisoformat(t_str).replace(tzinfo=tz)
            except Exception:
                continue

            # Tylko przyszłe godziny (co najmniej 30 min po teraz)
            diff_hours = (dt - now_dt).total_seconds() / 3600.0
            if diff_hours < 0.5:
                continue

            # Wybieramy pełne godziny w 3-godzinnych krokach (lub zbliżonych)
            hour = dt.hour
            if hour in (8, 12, 15, 18, 21) or (diff_hours >= 1.5 and len(upcoming_items) < 5 and (dt.hour % 3 == 0)):
                h_code = int(codes[idx]) if idx < len(codes) else 0
                _, h_icon = map_weather_code(h_code)
                h_temp = round(temps[idx]) if idx < len(temps) else curr_temp
                h_pop = int(pops[idx]) if idx < len(pops) and pops[idx] is not None else 0

                upcoming_items.append({
                    "time": dt.strftime("%H:00"),
                    "temp": h_temp,
                    "code": h_code,
                    "icon": h_icon,
                    "pop": h_pop,
                })

            if len(upcoming_items) >= 5:
                break

        # Awaryjnie, gdyby filtr dał za mało: weź co 3h
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
        logger.warning("Nie udało się pobrać pogody: %s", exc)
        if _cache:
            return _cache
        # Domyślny fallback na wypadek braku sieci
        return {
            "city": "Gliwice",
            "current": {"temp": 12, "code": 1, "condition": "Częściowo pochmurno", "icon": "cloud-sun"},
            "hourly": [
                {"time": "12:00", "temp": 14, "code": 1, "icon": "cloud-sun", "pop": 0},
                {"time": "15:00", "temp": 15, "code": 2, "icon": "cloud-sun", "pop": 10},
                {"time": "18:00", "temp": 11, "code": 3, "icon": "cloud", "pop": 20},
                {"time": "21:00", "temp": 8, "code": 3, "icon": "cloud", "pop": 15},
            ],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
