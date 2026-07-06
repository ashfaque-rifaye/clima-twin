"""GET /anomalies — local spatial anomaly detection over the grid.

A cell is anomalous when its hazard value deviates strongly from its *local
neighbourhood* (not the whole city) — e.g. a street that reads much hotter than
the blocks around it (a local heat island), or a canopy gap amid greenery. This
is the "identify patterns / anomalies" capability the brief calls for, and it is
more actionable for a planner than a global ranking (which just returns the
globally worst cells).

Method (O(n)): bin cells into a coarse spatial lattice, compare each cell to its
bin mean, and score the deviation against the city-wide standard deviation.
"""
from statistics import mean, pstdev

from fastapi import APIRouter, Query
from pydantic import BaseModel

from ..data import CHENNAI_BBOX, GRID

router = APIRouter(tags=["anomalies"])

_BINS = 6  # coarse neighbourhood lattice (≈6–7 km cells over Chennai)
_THRESHOLD = 1.0  # min z-score (vs city std) to count as an anomaly

# hazard -> (value_key, unit, worse_when_high)
_METRIC = {
    "heat": ("feels_like_c", "°C feels-like", True),
    "air": ("air_quality_index", " AQI", True),
    "flood": ("flood_score", " flood score", True),
    "green": ("green_cover_pct", "% canopy", False),
}


class Anomaly(BaseModel):
    name: str
    lat: float
    lng: float
    value: float
    neighbourhood_mean: float
    deviation: float
    score: float
    why: str


class AnomaliesResponse(BaseModel):
    hazard: str
    metric: str
    count: int
    anomalies: list[Anomaly]


def _bin_key(lat: float, lng: float) -> tuple[int, int]:
    lat_min, lat_max, lng_min, lng_max = CHENNAI_BBOX
    i = min(_BINS - 1, max(0, int((lat - lat_min) / ((lat_max - lat_min) / _BINS))))
    j = min(_BINS - 1, max(0, int((lng - lng_min) / ((lng_max - lng_min) / _BINS))))
    return i, j


def _why(hazard: str, name: str, value: float, dev: float) -> str:
    a = abs(dev)
    if hazard == "heat":
        return f"{name}: {value:.1f}°C feels-like — {a:.1f}°C hotter than nearby areas (local heat island)."
    if hazard == "air":
        return f"{name}: AQI {value:.0f} — {a:.0f} above the neighbourhood (pollution hotspot)."
    if hazard == "flood":
        return f"{name}: flood score {value:.2f} — {a:.2f} above nearby areas (localised flood risk)."
    return f"{name}: {value:.1f}% canopy — {a:.1f}% below nearby areas (green gap / fragmentation)."


@router.get("/anomalies", response_model=AnomaliesResponse)
def anomalies(
    hazard: str = Query("heat"),
    limit: int = Query(8, ge=1, le=50),
):
    key, unit, worse_high = _METRIC.get(hazard, _METRIC["heat"])

    vals = [c[key] for c in GRID if c.get(key) is not None]
    if not vals:
        return AnomaliesResponse(hazard=hazard, metric=key, count=0, anomalies=[])
    std = pstdev(vals) or 1.0

    bins: dict[tuple[int, int], list[float]] = {}
    for c in GRID:
        if c.get(key) is not None:
            bins.setdefault(_bin_key(c["lat"], c["lng"]), []).append(c[key])
    bin_mean = {k: mean(v) for k, v in bins.items()}

    scored = []
    for c in GRID:
        v = c.get(key)
        if v is None:
            continue
        bm = bin_mean[_bin_key(c["lat"], c["lng"])]
        dev = v - bm
        score = (dev / std) if worse_high else (-dev / std)
        if score >= _THRESHOLD:
            scored.append((score, c, v, bm, dev))

    scored.sort(key=lambda t: -t[0])
    out = [
        Anomaly(
            name=c["name"], lat=c["lat"], lng=c["lng"], value=round(v, 2),
            neighbourhood_mean=round(bm, 2), deviation=round(dev, 2), score=round(sc, 2),
            why=_why(hazard, c["name"], v, dev),
        )
        for sc, c, v, bm, dev in scored[:limit]
    ]
    return AnomaliesResponse(hazard=hazard, metric=key, count=len(out), anomalies=out)
