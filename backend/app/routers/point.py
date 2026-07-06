"""GET /point — real-time values for all three hazards at a lat/lng.

The five live lookups (Weather, Air Quality, hourly forecast, Geocoding,
Elevation) run concurrently; the short-term prediction is a deterministic
forecast heuristic so the endpoint never blocks on an LLM (the Gemini
narrative arrives via POST /recommend, which runs in parallel client-side).
Every field carries provenance in `sources` — live API vs urban-form model.
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel

from ..data import nearest_cell
from ..ml import MODEL as LST_MODEL
from ..pollen_model import synthetic_pollen
from ..realtime import realtime_point

router = APIRouter(tags=["point"])

_FLOOD_BASE = {"low": 0.2, "medium": 0.5, "high": 0.8}


def _aqi_category(aqi: int | None) -> str | None:
    if aqi is None:
        return None
    if aqi <= 50:
        return "Good"
    if aqi <= 100:
        return "Moderate"
    if aqi <= 150:
        return "Unhealthy for sensitive groups"
    if aqi <= 200:
        return "Bad"
    return "Severe"


class PointResponse(BaseModel):
    lat: float
    lng: float
    area_name: str | None = None
    live: bool = False
    heat: dict | None = None
    air: dict | None = None
    flood: dict | None = None
    pollen: dict | None = None
    elevation_m: float | None = None
    vulnerability: dict | None = None
    prediction: str | None = None
    model_baseline_c: float | None = None  # trained LST model's predicted feels-like
    source: str = "sample"
    sources: dict[str, str] = {}  # per-metric provenance (live API vs model)


def _predict(area: str, heat: dict, air: dict, fc: list[dict], rain: int) -> str:
    """Deterministic short-term outlook from the hourly forecast (no LLM —
    keeps /point fast; the Gemini narrative arrives via /recommend)."""
    now_c = heat.get("feels_like_c")
    peaks = [h.get("feels_like_c") for h in fc if h.get("feels_like_c") is not None]
    parts: list[str] = []
    if now_c is not None and peaks:
        peak = max(peaks)
        if peak >= now_c + 1:
            parts.append(f"Feels-like climbing toward {peak:.0f}°C in the next hours")
        elif peak <= now_c - 1:
            parts.append(f"Feels-like easing toward {peak:.0f}°C")
        else:
            parts.append(f"Feels-like holding near {now_c:.0f}°C")
    if rain >= 55:
        parts.append(f"{rain}% rain chance — waterlogging watch in low-lying stretches")
    elif rain >= 25:
        parts.append(f"{rain}% rain chance")
    aqi = air.get("aqi")
    if aqi is not None:
        parts.append(f"AQI ~{aqi} ({air.get('category', '—')})")
    action = (
        "advance drainage checks" if rain >= 55
        else "prioritise shade and hydration at waiting areas" if (now_c or 0) >= 38
        else "conditions manageable — good window for field work"
    )
    return f"{'; '.join(parts)}. For {area}: {action}."


@router.get("/point", response_model=PointResponse)
async def point(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
):
    cell = nearest_cell(lat, lng) or {}
    rt = await realtime_point(lat, lng)
    w, a, fc = rt.get("weather"), rt.get("air"), rt.get("forecast") or []
    pollen = rt.get("pollen")
    pollen_live = pollen is not None
    if pollen is None and cell:
        # Google Pollen has no India coverage — model it from local vegetation.
        pollen = synthetic_pollen(cell)
    live = rt.get("live", False)
    elev = rt.get("elevation") if rt.get("elevation") is not None else cell.get("elevation_m")
    area = rt.get("name") or cell.get("name") or "this area"

    heat = {
        "feels_like_c": (w or {}).get("feels_like_c") if live else cell.get("feels_like_c"),
        "temp_c": (w or {}).get("temp_c"),
        "condition": (w or {}).get("condition"),
        "humidity": (w or {}).get("humidity"),
    }
    aqi = (a or {}).get("aqi") if (a and a.get("aqi") is not None) else cell.get("air_quality_index")
    air = {
        "aqi": aqi,
        "category": (a or {}).get("category") or _aqi_category(aqi),
        "dominant": (a or {}).get("dominant") or cell.get("dominant_pollutant"),
        "health": (a or {}).get("health"),
    }

    rain = max([(h.get("rain_prob") or 0) for h in fc], default=((w or {}).get("rain_prob") or 0))
    if elev is not None:
        base = 0.85 if elev < 4 else 0.6 if elev < 10 else 0.35 if elev < 20 else 0.15
        basis = f"elevation {elev:.0f} m + {rain}% rain forecast"
    else:
        base = _FLOOD_BASE.get(cell.get("flood_risk"), 0.3)
        basis = "rainfall forecast + terrain"
    score = min(1.0, base * 0.6 + (rain / 100) * 0.6)
    flood = {
        "risk": "high" if score >= 0.66 else "medium" if score >= 0.4 else "low",
        "rain_prob": rain,
        "basis": basis,
    }

    prediction = _predict(area, heat, air, fc, rain)

    foot = cell.get("bus_commuters_daily", 0)
    vulnerability = {
        "ndvi": cell.get("ndvi"),
        "green_cover_pct": cell.get("green_cover_pct"),
        "commuter_footfall": "High" if foot >= 1500 else "Medium" if foot >= 900 else "Low",
        "elderly_pct": cell.get("elderly_pct"),
        "population": cell.get("population"),
        "data_blind_spot": cell.get("data_density") == "low",
    }

    model_baseline_c = LST_MODEL.predict(cell) if cell else None

    sources = {
        "heat": "Google Weather API (live)" if (w and live) else "urban-form model",
        "air": "Google Air Quality API (live)" if (a and a.get("aqi") is not None) else "urban-form model",
        "flood": ("Google Elevation + rain forecast (live)" if rt.get("elevation") is not None
                  else "elevation-drainage model"),
        "elevation": "Google Elevation API" if rt.get("elevation") is not None else "urban-form model",
        "area_name": "Google Geocoding" if rt.get("name") else "urban-form model",
        "vulnerability": "urban-form model (census-informed)",
        "ndvi": "NDVI proxy — Earth Engine export pending",
        "prediction": "hourly-forecast heuristic",
        "model_baseline": ("BigQuery ML LST model (in-process)" if model_baseline_c is not None
                           else "LST model not available"),
        "pollen": ("Google Pollen API (live)" if pollen_live
                   else "modeled — no live Pollen coverage (India)" if pollen
                   else "Pollen API (no data for this point)"),
    }

    return PointResponse(
        lat=lat, lng=lng, area_name=area, live=live,
        heat=heat, air=air, flood=flood, pollen=pollen, elevation_m=elev,
        vulnerability=vulnerability, prediction=prediction,
        model_baseline_c=model_baseline_c,
        source="live" if live else "sample",
        sources=sources,
    )
