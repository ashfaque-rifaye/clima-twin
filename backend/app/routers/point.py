"""GET /point — real-time values for all three hazards at a lat/lng + AI prediction.

Live data from Google Weather + Air Quality APIs (cached); flood modeled from
rainfall forecast + terrain. Falls back to the sample grid when live data is
unavailable (e.g., no server key).
"""
from fastapi import APIRouter
from pydantic import BaseModel

from ..data import nearest_cell
from ..realtime import realtime_point
from ..gemini import generate, gemini_available

router = APIRouter(tags=["point"])

_FLOOD_BASE = {"low": 0.2, "medium": 0.5, "high": 0.8}


class PointResponse(BaseModel):
    lat: float
    lng: float
    area_name: str | None = None
    live: bool = False
    heat: dict | None = None
    air: dict | None = None
    flood: dict | None = None
    elevation_m: float | None = None
    vulnerability: dict | None = None
    prediction: str | None = None
    source: str = "sample"


@router.get("/point", response_model=PointResponse)
def point(lat: float, lng: float):
    cell = nearest_cell(lat, lng) or {}
    rt = realtime_point(lat, lng)
    w, a, fc = rt.get("weather"), rt.get("air"), rt.get("forecast") or []
    live = rt.get("live", False)
    elev = rt.get("elevation")
    area = rt.get("name") or cell.get("name") or "this area"

    heat = {
        "feels_like_c": (w or {}).get("feels_like_c") if live else cell.get("feels_like_c"),
        "temp_c": (w or {}).get("temp_c"),
        "condition": (w or {}).get("condition"),
        "humidity": (w or {}).get("humidity"),
    }
    air = {
        "aqi": (a or {}).get("aqi") if (a and a.get("aqi") is not None) else cell.get("air_quality_index"),
        "category": (a or {}).get("category"),
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

    prediction = None
    if gemini_available() and live:
        peak = max([(h.get("feels_like_c") or 0) for h in fc], default=(heat["feels_like_c"] or 0))
        prediction = generate(
            f"Location: {area} in Chennai (elevation {elev} m). Right now: feels-like "
            f"{heat['feels_like_c']}C, AQI {air['aqi']} ({air.get('category')}), rain chance {rain}%. "
            f"Next 8h feels-like peaks around {peak}C. In 2 short sentences, predict how heat, air and "
            f"flood risk will change over the next few hours and the single best action to take. "
            f"Plain English, no markdown."
        )

    foot = cell.get("bus_commuters_daily", 0)
    vulnerability = {
        "ndvi": cell.get("ndvi"),
        "green_cover_pct": cell.get("green_cover_pct"),
        "commuter_footfall": "High" if foot >= 1500 else "Medium" if foot >= 900 else "Low",
        "elderly_pct": cell.get("elderly_pct"),
        "population": cell.get("population"),
        "data_blind_spot": cell.get("data_density") == "low",
    }

    return PointResponse(
        lat=lat, lng=lng, area_name=area, live=live,
        heat=heat, air=air, flood=flood, elevation_m=elev,
        vulnerability=vulnerability, prediction=prediction,
        source="live" if live else "sample",
    )
