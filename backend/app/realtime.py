"""Real-time microclimate from Google APIs (Weather + Air Quality), cached.

Uses the server-side (API-restricted) key. Every call degrades gracefully to
None so /point can fall back to sample data.
"""
import asyncio
import time

import httpx

from .config import settings

_cache: dict[tuple, tuple[float, dict]] = {}
_grid_cache: dict[str, tuple[float, list]] = {}
_TTL = 600  # seconds
_GRID_TTL = 1800  # 30 min

# Chennai bounding box: lat_min, lat_max, lng_min, lng_max
CHENNAI_BBOX = (12.84, 13.24, 80.15, 80.34)


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


def reverse_geocode(lat: float, lng: float) -> str | None:
    """Exact locality/neighborhood name at the clicked coordinate."""
    try:
        r = httpx.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"key": _key(), "latlng": f"{lat},{lng}"},
            timeout=8,
        )
        if r.status_code == 200:
            results = r.json().get("results") or []
            for want in ("sublocality_level_1", "sublocality", "neighborhood", "locality"):
                for res in results:
                    for comp in res.get("address_components", []):
                        if want in comp.get("types", []):
                            return comp.get("long_name")
            if results:
                return (results[0].get("formatted_address") or "").split(",")[0] or None
    except Exception:
        pass
    return None


def elevation(lat: float, lng: float) -> float | None:
    """Ground elevation (m) at the exact coordinate — drives flood risk."""
    try:
        r = httpx.get(
            "https://maps.googleapis.com/maps/api/elevation/json",
            params={"key": _key(), "locations": f"{lat},{lng}"},
            timeout=8,
        )
        if r.status_code == 200:
            res = r.json().get("results") or []
            if res:
                return res[0].get("elevation")
    except Exception:
        pass
    return None


def realtime_point(lat: float, lng: float) -> dict:
    ck = (round(lat, 3), round(lng, 3))
    now = time.time()
    if ck in _cache and now - _cache[ck][0] < _TTL:
        return _cache[ck][1]
    w = current_weather(lat, lng)
    a = current_air(lat, lng)
    data = {
        "weather": w,
        "air": a,
        "forecast": weather_forecast(lat, lng),
        "name": reverse_geocode(lat, lng),
        "elevation": elevation(lat, lng),
        "live": bool(w or a),
    }
    _cache[ck] = (now, data)
    return data


# ---- continuous hazard grids (for the map heat overlays) ----

def _grid_pts(n: int) -> list[tuple[float, float]]:
    a, b, c, d = CHENNAI_BBOX
    return [(a + (b - a) * i / (n - 1), c + (d - c) * j / (n - 1)) for i in range(n) for j in range(n)]


async def _afeels(client: httpx.AsyncClient, lat: float, lng: float):
    try:
        r = await client.get(
            "https://weather.googleapis.com/v1/currentConditions:lookup",
            params={"key": _key(), "location.latitude": lat, "location.longitude": lng, "unitsSystem": "METRIC"},
        )
        if r.status_code == 200:
            return (r.json().get("feelsLikeTemperature") or {}).get("degrees")
    except Exception:
        pass
    return None


async def heat_grid(n: int = 8) -> list[dict]:
    pts = _grid_pts(n)
    async with httpx.AsyncClient(timeout=10) as client:
        vals = await asyncio.gather(*[_afeels(client, la, ln) for la, ln in pts])
    return [{"lat": la, "lng": ln, "v": v} for (la, ln), v in zip(pts, vals) if v is not None]


def elevation_grid(n: int = 8) -> list[dict]:
    pts = _grid_pts(n)
    locs = "|".join(f"{la},{ln}" for la, ln in pts)
    try:
        r = httpx.get("https://maps.googleapis.com/maps/api/elevation/json", params={"key": _key(), "locations": locs}, timeout=15)
        if r.status_code == 200:
            return [{"lat": x["location"]["lat"], "lng": x["location"]["lng"], "v": x["elevation"]} for x in (r.json().get("results") or [])]
    except Exception:
        pass
    return []


def _norm(raw: list[dict], invert: bool = False) -> list[dict]:
    vals = [p["v"] for p in raw if p["v"] is not None]
    if not vals:
        return []
    lo, hi = min(vals), max(vals)
    span = (hi - lo) or 1.0
    return [
        {"lat": p["lat"], "lng": p["lng"], "weight": round(((hi - p["v"]) / span) if invert else ((p["v"] - lo) / span), 3)}
        for p in raw
    ]


async def hazard_grid(hazard: str, n: int = 8) -> list[dict]:
    now = time.time()
    if hazard in _grid_cache and now - _grid_cache[hazard][0] < _GRID_TTL:
        return _grid_cache[hazard][1]
    if hazard == "heat":
        pts = _norm(await heat_grid(n))
    elif hazard == "flood":
        pts = _norm(elevation_grid(n), invert=True)  # low elevation => high flood weight
    else:
        pts = []
    _grid_cache[hazard] = (now, pts)
    return pts
