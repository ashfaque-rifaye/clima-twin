"""Real-time microclimate from Google APIs (Weather + Air Quality), cached.

Uses the server-side (API-restricted) key. Every call degrades gracefully to
None so /point can fall back to sample data.
"""
import time

import httpx

from .config import settings

_cache: dict[tuple, tuple[float, dict]] = {}
_TTL = 600  # seconds


def _key() -> str:
    return settings.server_api_key or settings.google_maps_api_key


def current_weather(lat: float, lng: float) -> dict | None:
    try:
        r = httpx.get(
            "https://weather.googleapis.com/v1/currentConditions:lookup",
            params={"key": _key(), "location.latitude": lat, "location.longitude": lng, "unitsSystem": "METRIC"},
            timeout=8,
        )
        if r.status_code == 200:
            d = r.json()
            return {
                "temp_c": (d.get("temperature") or {}).get("degrees"),
                "feels_like_c": (d.get("feelsLikeTemperature") or {}).get("degrees"),
                "humidity": d.get("relativeHumidity"),
                "condition": ((d.get("weatherCondition") or {}).get("description") or {}).get("text"),
                "rain_prob": ((d.get("precipitation") or {}).get("probability") or {}).get("percent"),
            }
    except Exception:
        pass
    return None


def current_air(lat: float, lng: float) -> dict | None:
    try:
        r = httpx.post(
            "https://airquality.googleapis.com/v1/currentConditions:lookup",
            params={"key": _key()},
            json={"location": {"latitude": lat, "longitude": lng},
                  "extraComputations": ["LOCAL_AQI", "DOMINANT_POLLUTANT_CONCENTRATION", "HEALTH_RECOMMENDATIONS"]},
            timeout=8,
        )
        if r.status_code == 200:
            d = r.json()
            idx = d.get("indexes") or []
            uaqi = next((i for i in idx if i.get("code") == "uaqi"), None)
            local = next((i for i in idx if i.get("code") != "uaqi"), None)
            main = local or uaqi or (idx[0] if idx else {})
            return {
                "aqi": main.get("aqi"),
                "category": main.get("category"),
                "dominant": (uaqi or main).get("dominantPollutant"),
                "health": (d.get("healthRecommendations") or {}).get("generalPopulation"),
            }
    except Exception:
        pass
    return None


def weather_forecast(lat: float, lng: float, hours: int = 8) -> list[dict]:
    try:
        r = httpx.get(
            "https://weather.googleapis.com/v1/forecast/hours:lookup",
            params={"key": _key(), "location.latitude": lat, "location.longitude": lng, "hours": hours, "unitsSystem": "METRIC"},
            timeout=8,
        )
        if r.status_code == 200:
            d = r.json()
            return [
                {
                    "feels_like_c": (h.get("feelsLikeTemperature") or {}).get("degrees"),
                    "rain_prob": ((h.get("precipitation") or {}).get("probability") or {}).get("percent"),
                }
                for h in (d.get("forecastHours") or [])[:hours]
            ]
    except Exception:
        pass
    return []


def realtime_point(lat: float, lng: float) -> dict:
    ck = (round(lat, 3), round(lng, 3))
    now = time.time()
    if ck in _cache and now - _cache[ck][0] < _TTL:
        return _cache[ck][1]
    w = current_weather(lat, lng)
    a = current_air(lat, lng)
    data = {"weather": w, "air": a, "forecast": weather_forecast(lat, lng), "live": bool(w or a)}
    _cache[ck] = (now, data)
    return data
