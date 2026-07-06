"""Real-time microclimate from Google APIs (Weather + Air Quality), cached.

Uses the server-side (API-restricted) key. Every call degrades gracefully to
None so /point can fall back to sample data.
"""
import asyncio
import logging
import time
from collections import OrderedDict

import httpx

from .config import settings

log = logging.getLogger("climatwin.realtime")

# Per-coordinate live-readout cache. Bounded LRU so a flood of distinct
# coordinates (many clicks, or abuse) can't grow memory without limit.
_cache: "OrderedDict[tuple, tuple[float, dict]]" = OrderedDict()
_CACHE_MAX = 2048
_grid_cache: dict[str, tuple[float, list]] = {}
_TTL = 600  # seconds
_GRID_TTL = 1800  # 30 min
_GRID_CONCURRENCY = 16  # be polite to the Weather/AQ APIs


def _recall(ck: tuple) -> dict | None:
    """Return a fresh cached readout for a coordinate key, or None."""
    entry = _cache.get(ck)
    if entry and time.time() - entry[0] < _TTL:
        _cache.move_to_end(ck)  # mark most-recently-used
        return entry[1]
    return None


def _remember(ck: tuple, data: dict) -> None:
    """Cache a readout and evict the oldest entries beyond the LRU cap."""
    _cache[ck] = (time.time(), data)
    _cache.move_to_end(ck)
    while len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)

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


def current_pollen(lat: float, lng: float) -> dict | None:
    """Live pollen (tree/grass/weed) at a point — drives species trade-offs.

    Coverage is uneven (esp. in India); returns None gracefully when the point
    has no forecast, so callers simply omit the pollen block."""
    try:
        r = httpx.get(
            "https://pollen.googleapis.com/v1/forecast:lookup",
            params={"key": _key(), "location.latitude": lat, "location.longitude": lng, "days": 1},
            timeout=8,
        )
        if r.status_code != 200:
            return None
        daily = (r.json().get("dailyInfo") or [])
        if not daily:
            return None
        types = daily[0].get("pollenTypeInfo") or []
        out, dominant, health = [], None, None
        for t in types:
            idx = t.get("indexInfo") or {}
            val = idx.get("value")
            out.append({"type": t.get("displayName") or t.get("code"), "value": val, "category": idx.get("category")})
            if val is not None and (dominant is None or val > dominant["value"]):
                dominant = {"type": t.get("displayName") or t.get("code"), "value": val, "category": idx.get("category")}
            if health is None and t.get("healthRecommendations"):
                recs = t["healthRecommendations"]
                health = recs[0] if isinstance(recs, list) and recs else None
        if not out:
            return None
        return {"dominant": dominant, "types": out, "health": health}
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


async def realtime_point(lat: float, lng: float) -> dict:
    """All five live lookups CONCURRENTLY (was sequential: 5×1–2 s → ~max one).

    Point-click latency is dominated by this function; keep it parallel.
    """
    ck = (round(lat, 3), round(lng, 3))
    cached = _recall(ck)
    if cached is not None:
        return cached

    w = a = fc = name = elev = pollen = None
    try:
        w, a, fc, name, elev, pollen = await asyncio.gather(
            asyncio.to_thread(current_weather, lat, lng),
            asyncio.to_thread(current_air, lat, lng),
            asyncio.to_thread(weather_forecast, lat, lng),
            asyncio.to_thread(reverse_geocode, lat, lng),
            asyncio.to_thread(elevation, lat, lng),
            asyncio.to_thread(current_pollen, lat, lng),
        )
    except Exception as exc:
        log.warning("realtime_point gather failed: %s", type(exc).__name__)

    data = {
        "weather": w,
        "air": a,
        "forecast": fc or [],
        "name": name,
        "elevation": elev,
        "pollen": pollen,
        "live": bool(w or a),
    }
    _remember(ck, data)
    return data


# ---- continuous hazard grids (for the map heat overlays) ----

def _grid_pts(n: int) -> list[tuple[float, float]]:
    a, b, c, d = CHENNAI_BBOX
    return [(a + (b - a) * i / (n - 1), c + (d - c) * j / (n - 1)) for i in range(n) for j in range(n)]


async def _afeels(client: httpx.AsyncClient, sem: asyncio.Semaphore, lat: float, lng: float):
    try:
        async with sem:
            r = await client.get(
                "https://weather.googleapis.com/v1/currentConditions:lookup",
                params={"key": _key(), "location.latitude": lat, "location.longitude": lng, "unitsSystem": "METRIC"},
            )
        if r.status_code == 200:
            return (r.json().get("feelsLikeTemperature") or {}).get("degrees")
        log.warning("weather grid point %s,%s -> HTTP %s", lat, lng, r.status_code)
    except Exception as exc:
        log.warning("weather grid point %s,%s failed: %s", lat, lng, type(exc).__name__)
    return None


async def _aaqi(client: httpx.AsyncClient, sem: asyncio.Semaphore, lat: float, lng: float):
    try:
        async with sem:
            r = await client.post(
                "https://airquality.googleapis.com/v1/currentConditions:lookup",
                params={"key": _key()},
                json={"location": {"latitude": lat, "longitude": lng}},
            )
        if r.status_code == 200:
            idx = r.json().get("indexes") or []
            if idx:
                return idx[0].get("aqi")
    except Exception as exc:
        log.warning("air grid point %s,%s failed: %s", lat, lng, type(exc).__name__)
    return None


async def heat_grid(n: int = 8) -> list[dict]:
    pts = _grid_pts(n)
    sem = asyncio.Semaphore(_GRID_CONCURRENCY)
    async with httpx.AsyncClient(timeout=10) as client:
        vals = await asyncio.gather(*[_afeels(client, sem, la, ln) for la, ln in pts])
    return [{"lat": la, "lng": ln, "v": v} for (la, ln), v in zip(pts, vals) if v is not None]


async def air_grid(n: int = 4) -> list[dict]:
    """Sparse live AQI anchors (n*n calls — keep small, AQ free tier is 10k/mo)."""
    pts = _grid_pts(n)
    sem = asyncio.Semaphore(_GRID_CONCURRENCY)
    async with httpx.AsyncClient(timeout=10) as client:
        vals = await asyncio.gather(*[_aaqi(client, sem, la, ln) for la, ln in pts])
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


_refreshing: set[str] = set()
_refresh_tasks: set = set()


async def _compute_hazard_grid(hazard: str, n: int) -> list[dict]:
    if hazard == "heat":
        return _norm(await heat_grid(n))
    if hazard == "flood":
        return _norm(elevation_grid(n), invert=True)  # low elevation => high flood weight
    if hazard == "air":
        return _norm(await air_grid())
    return []


async def _refresh_hazard(hazard: str, n: int) -> None:
    try:
        pts = await _compute_hazard_grid(hazard, n)
        now = time.time()
        if pts:
            _grid_cache[hazard] = (now, pts)
        else:
            # short negative-cache: retry in ~2 min, not on every request
            log.warning("live %s grid unavailable — serving synthetic fallback", hazard)
            _grid_cache[hazard] = (now - _GRID_TTL + 120, [])
    except Exception:
        log.exception("hazard grid refresh failed: %s", hazard)
    finally:
        _refreshing.discard(hazard)


def _schedule_refresh(hazard: str, n: int) -> None:
    if not _key() or hazard in _refreshing:
        return
    _refreshing.add(hazard)
    task = asyncio.create_task(_refresh_hazard(hazard, n))
    _refresh_tasks.add(task)  # keep a reference so the task isn't GC'd
    task.add_done_callback(_refresh_tasks.discard)


async def hazard_grid(hazard: str, n: int = 8) -> list[dict]:
    """Live anchor points (normalised 0..1 weights), refreshed in the background.

    Reads are INSTANT: return whatever live anchors are cached (empty until the
    first background refresh lands → callers use the synthetic field), and kick
    off a background refresh when the cache is stale. The 64-call live fan-out
    never blocks a request — matching the deck's "instant reads; live calls only
    for the selected point". Empty means "no live data yet".
    """
    now = time.time()
    cached = _grid_cache.get(hazard)
    if cached and now - cached[0] < _GRID_TTL:
        return cached[1]
    _schedule_refresh(hazard, n)
    return cached[1] if cached else []
