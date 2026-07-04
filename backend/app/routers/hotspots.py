"""GET /hotspots - equity-weighted priority list by hazard."""
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from ..data import GRID

router = APIRouter(tags=["hotspots"])


class Hotspot(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    priority_score: float
    why: str


class HotspotsResponse(BaseModel):
    hazard: str = "heat"
    hotspots: list[Hotspot] = []
    source: str = "synthetic"


_FLOOD = {"low": 0.2, "medium": 0.55, "high": 0.9}
_BLIND = {"low": 1.0, "medium": 0.5, "high": 0.0}


def _score(cell: dict, hazard: str) -> float:
    heat = max(0.0, (cell["feels_like_c"] - 35) / 12)
    low_green = max(0.0, (30 - cell["green_cover_pct"]) / 30)
    air = max(0.0, (cell["air_quality_index"] - 80) / 120)
    flood = _FLOOD.get(cell.get("flood_risk"), 0.3)
    vuln = min(cell.get("elderly_pct", 0) / 15, 1) * 0.5 + min(cell.get("population", 0) / 15000, 1) * 0.5
    blind = _BLIND.get(cell.get("data_density"), 0.5)
    base = {"heat": 0.6 * heat + 0.4 * low_green, "air": air, "flood": flood}.get(hazard, heat)
    return round(0.6 * base + 0.25 * vuln + 0.15 * blind, 3)


def _why(cell: dict, hazard: str) -> str:
    if hazard == "flood":
        return (
            f"{cell.get('flood_risk', 'unknown')} flood risk | {cell.get('elevation_m', '?')} m elevation | "
            f"{int(cell.get('waterway_proximity', 0) * 100)}% waterway proximity | "
            f"{cell.get('bus_commuters_daily', 0)} daily commuters | data {cell.get('data_density', '?')}"
        )
    if hazard == "air":
        return (
            f"AQI {cell['air_quality_index']} {cell.get('dominant_pollutant', '')} | "
            f"{int(cell.get('road_pressure', 0) * 100)}% traffic pressure | "
            f"{cell['green_cover_pct']}% canopy | {cell.get('bus_commuters_daily', 0)} daily commuters | "
            f"data {cell.get('data_density', '?')}"
        )
    return (
        f"{cell['feels_like_c']}C feels-like | {cell['green_cover_pct']}% canopy | "
        f"AQI {cell['air_quality_index']} | {cell.get('bus_commuters_daily', 0)} daily commuters | "
        f"data {cell.get('data_density', '?')}"
    )


@router.get("/hotspots", response_model=HotspotsResponse)
def hotspots(
    hazard: Literal["heat", "flood", "air", "green"] = "heat",
    limit: int = Query(default=5, ge=1, le=50),
):
    ranked = sorted(GRID, key=lambda c: _score(c, hazard), reverse=True)[:limit]
    return HotspotsResponse(
        hazard=hazard,
        hotspots=[
            Hotspot(
                id=c["id"],
                name=c["name"],
                lat=c["lat"],
                lng=c["lng"],
                priority_score=_score(c, hazard),
                why=_why(c, hazard),
            )
            for c in ranked
        ],
    )
