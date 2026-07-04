"""GET /grid — continuous Chennai hazard field for the map overlays.

The dense synthetic field (urban-form model: land use, waterways, roads)
provides sub-grid spatial texture; live Google anchors (Weather feels-like /
Elevation / Air Quality) calibrate it to right-now reality. When live data is
unavailable the synthetic field serves alone, and `source` says so honestly.
"""
import logging
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from ..data import GRID_SIZE, grid_points
from ..realtime import hazard_grid

log = logging.getLogger("climatwin.grid")

router = APIRouter(tags=["grid"])

Hazard = Literal["heat", "flood", "air", "green"]

# live anchors dominate the field level; the model keeps street-scale texture
_LIVE_BLEND = 0.6


class GridPoint(BaseModel):
    lat: float
    lng: float
    weight: float
    value: float | int | str | None = None
    name: str | None = None
    flood_risk: str | None = None
    aqi: int | None = None
    feels_like_c: float | None = None


class GridResponse(BaseModel):
    hazard: str
    points: list[GridPoint]
    source: str = "synthetic"


def _idw(lat: float, lng: float, anchors: list[dict]) -> float:
    """Inverse-distance-squared interpolation of anchor weights at (lat, lng)."""
    num = den = 0.0
    for a in anchors:
        d2 = (lat - a["lat"]) ** 2 + (lng - a["lng"]) ** 2
        if d2 < 1e-8:
            return a["weight"]
        w = 1.0 / d2
        num += w * a["weight"]
        den += w
    return num / den if den else 0.0


async def calibrated_grid(hazard: str, n: int = GRID_SIZE) -> tuple[list[dict], str]:
    """Full-city lattice with live-calibrated, rank-normalised weights.

    Shared by GET /grid (whole-city consumers, e.g. air-particle seeds) and
    the tile engine (which slices it per tile). Falls back to the pure
    urban-form model when live anchors are unavailable.
    """
    points = grid_points(hazard, n)
    source = "synthetic"

    try:
        anchors = await hazard_grid(hazard)
    except Exception:
        log.exception("live %s anchors failed — synthetic only", hazard)
        anchors = []

    if anchors:
        for p in points:
            live = _idw(p["lat"], p["lng"], anchors)
            p["weight"] = _LIVE_BLEND * live + (1 - _LIVE_BLEND) * p["weight"]
        _stretch(points)
        source = "live+model"

    return points, source


@router.get("/grid", response_model=GridResponse)
async def grid(
    hazard: Hazard = "heat",
    n: int = Query(default=GRID_SIZE, ge=2, le=GRID_SIZE),
):
    points, source = await calibrated_grid(hazard, n)
    return GridResponse(hazard=hazard, points=points, source=source)


def _stretch(points: list[dict]) -> None:
    """Rank-normalise display weights to a uniform 0..1 spread.

    Live city-wide values cluster in a narrow hot band (all of Chennai is hot
    at 3 pm), which renders as a flat single-colour wash. Rank mapping keeps
    the exact spatial ordering — the display is explicitly relative (coolest
    to hottest across the city); absolute values stay in `value` fields.
    """
    if not points:
        return
    order = sorted(range(len(points)), key=lambda i: points[i]["weight"])
    denom = max(len(points) - 1, 1)
    for rank, i in enumerate(order):
        points[i]["weight"] = round(rank / denom, 3)
