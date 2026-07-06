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
    """Full-city lattice with live-calibrated weights + hazard display physics.

    heat  → UHI localization: cell minus its neighbourhood mean (box
            high-pass), recentred at 0.5 — only genuine local heat islands
            deviate from the transparent midpoint, never the whole city.
    flood → hydrological coupling: elevation risk sharpened and multiplied
            by drainage proximity — risk exists only where terrain and
            channels support it.
    air   → rank-normalised exposure gradient (dispersion field).
    green → canopy density (NDVI proxy) as-is.

    Shared by GET /grid and the tile engine. Falls back to the pure
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
        source = "live+model"

    if hazard == "heat":
        _localize_uhi(points)
    elif hazard == "flood":
        if anchors:
            _stretch(points)
        _hydrologize(points)
    elif anchors:
        _stretch(points)

    return points, source


def _localize_uhi(points: list[dict], radius: int = 3, gain: float = 2.6) -> None:
    """Urban-heat-island transform: local deviation from the neighbourhood.

    A heat island is a cell hotter than its OWN surroundings — not a cell in
    the hot half of a citywide ranking (which by construction tints half the
    city). Box high-pass over the regular lattice, recentred at 0.5 so the
    diverging renderer's transparent dead-zone sits at "no anomaly".
    """
    lats = sorted({p["lat"] for p in points})
    lngs = sorted({p["lng"] for p in points})
    li = {v: i for i, v in enumerate(lats)}
    gi = {v: i for i, v in enumerate(lngs)}
    w = [[0.0] * len(lngs) for _ in lats]
    for p in points:
        w[li[p["lat"]]][gi[p["lng"]]] = p["weight"]

    for p in points:
        i, j = li[p["lat"]], gi[p["lng"]]
        total = count = 0.0
        for di in range(-radius, radius + 1):
            for dj in range(-radius, radius + 1):
                ii, jj = i + di, j + dj
                if 0 <= ii < len(lats) and 0 <= jj < len(lngs):
                    total += w[ii][jj]
                    count += 1
        anomaly = p["weight"] - total / count
        p["weight"] = round(min(1.0, max(0.0, 0.5 + anomaly * gain)), 3)


def _hydrologize(points: list[dict]) -> None:
    """Flood risk only where terrain supports it: sharpen the elevation
    signal and weight by proximity to real drainage (rivers, canals, marsh).
    Cells far from any channel stay near-transparent."""
    for p in points:
        prox = float(p.get("waterway_proximity") or 0.0)
        p["weight"] = round(min(1.0, (p["weight"] ** 1.5) * (0.25 + 0.75 * prox) * 1.55), 3)


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
