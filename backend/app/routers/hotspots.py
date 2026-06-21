"""GET /hotspots — priority list of areas to act on (equity-weighted).

Ranks the Chennai grid by hazard severity x vulnerability x data-sparsity
("blind spot" boost), so the neediest + least-measured areas surface, not just
the hottest rich ones. Day 4: same scoring over the full BigQuery grid.
"""
from fastapi import APIRouter
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
    source: str = "sample"


_FLOOD = {"low": 0.2, "medium": 0.55, "high": 0.9}
_BLIND = {"low": 1.0, "medium": 0.5, "high": 0.0}  # low data density => bigger blind-spot boost


def _score(cell: dict, hazard: str) -> float:
    heat = max(0.0, (cell["feels_like_c"] - 35) / 12)
    low_green = max(0.0, (30 - cell["green_cover_pct"]) / 30)
    air = max(0.0, (cell["air_quality_index"] - 80) / 120)
    flood = _FLOOD.get(cell.get("flood_risk"), 0.3)
    vuln = min(cell.get("elderly_pct", 0) / 15, 1) * 0.5 + min(cell.get("population", 0) / 15000, 1) * 0.5
    blind = _BLIND.get(cell.get("data_density"), 0.5)
    base = {"heat": 0.6 * heat + 0.4 * low_green, "air": air, "flood": flood}.get(hazard, heat)
    return round(0.6 * base + 0.25 * vuln + 0.15 * blind, 3)


@router.get("/hotspots", response_model=HotspotsResponse)
def hotspots(hazard: str = "heat", limit: int = 5):
    ranked = sorted(GRID, key=lambda c: _score(c, hazard), reverse=True)[:limit]
    out = [
        Hotspot(
            id=c["id"],
            name=c["name"],
            lat=c["lat"],
            lng=c["lng"],
            priority_score=_score(c, hazard),
            why=(
                f"{c['feels_like_c']}°C feels-like · {c['green_cover_pct']}% canopy · "
                f"AQI {c['air_quality_index']} · {c.get('bus_commuters_daily', 0)} daily commuters · "
                f"data {c.get('data_density', '?')}"
            ),
        )
        for c in ranked
    ]
    return HotspotsResponse(hazard=hazard, hotspots=out)
