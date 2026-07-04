"""GET /tiles/{hazard}/{z}/{x}/{y} — multi-resolution spatial tiles.

The renderer never fetches whole regions: it asks for visible XYZ tiles and
this router serves the dataset matched to the zoom band:

    z 4–6   country  → state climate summaries (no hotspots, macro only)
    z 7–9   state    → TN district summaries + major rivers
    z 10–12 city     → live-calibrated analysis lattice (≈0.7–1.5 km cells)
    z 13–15 block    → 100 m downscale (derived per tile) + real assets
    z 16+   street   → 100 m cells + assets (intervention-planning band)

Spatial indexing: the city lattice is regular, so a tile maps to an index
range (O(1)); tiles carry a one-cell margin so client-side interpolation is
seamless across tile edges. Responses are LRU-cached per (hazard, tile,
calibration-epoch) — the epoch rotates with the 30-min live-anchor refresh.
"""
import math
import time
from typing import Literal

from fastapi import APIRouter, Path
from pydantic import BaseModel

from ..datasets import CHENNAI_ASSETS, INDIA_STATES, TN_DISTRICTS, TN_RIVERS
from .grid import calibrated_grid

router = APIRouter(tags=["tiles"])

Hazard = Literal["heat", "flood", "air", "green"]
Band = Literal["country", "state", "city", "block", "street"]

# 100 m derived lattice steps (degrees)
BLOCK_LAT_STEP = 0.0009
BLOCK_LNG_STEP = 0.00092

_CAL_TTL = 1800  # matches the live-anchor cache in realtime.py


class TileCell(BaseModel):
    lat: float
    lng: float
    weight: float


class TileSummary(BaseModel):
    name: str
    lat: float
    lng: float
    value: float


class TileRiver(BaseModel):
    name: str
    path: list[list[float]]


class TileAsset(BaseModel):
    name: str
    kind: str
    lat: float
    lng: float


class TileResponse(BaseModel):
    band: Band
    z: int
    x: int
    y: int
    bounds: list[float]           # [west, south, east, north]
    extent: list[float] | None = None  # full data extent (for edge fades)
    source: str
    cells: list[TileCell] = []
    summaries: list[TileSummary] = []
    rivers: list[TileRiver] = []
    assets: list[TileAsset] = []


def band_for_zoom(z: int) -> Band:
    if z <= 6:
        return "country"
    if z <= 9:
        return "state"
    if z <= 12:
        return "city"
    if z <= 15:
        return "block"
    return "street"


def tile_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """Web-Mercator XYZ tile → (west, south, east, north) in degrees."""
    n = 2.0 ** z
    west = x / n * 360.0 - 180.0
    east = (x + 1) / n * 360.0 - 180.0
    north = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return west, south, east, north


def _hash01(lat: float, lng: float) -> float:
    """Deterministic 0..1 texture noise anchored to absolute coordinates."""
    v = math.sin(lat * 127.1 + lng * 311.7) * 43758.5453
    return v - math.floor(v)


class _Lattice:
    """Regular-lattice view over the calibrated city grid (spatial index)."""

    def __init__(self, points: list[dict]):
        self.lats = sorted({p["lat"] for p in points})
        self.lngs = sorted({p["lng"] for p in points})
        idx = {(p["lat"], p["lng"]): p["weight"] for p in points}
        self.w = [[idx[(la, ln)] for ln in self.lngs] for la in self.lats]
        self.extent = [self.lngs[0], self.lats[0], self.lngs[-1], self.lats[-1]]

    def slice(self, w: float, s: float, e: float, n: float, margin: int = 1) -> list[dict]:
        """Cells inside a bbox, padded by `margin` lattice steps (O(range))."""
        import bisect
        if e < self.lngs[0] or w > self.lngs[-1] or n < self.lats[0] or s > self.lats[-1]:
            return []  # no intersection with the data extent
        i0 = max(0, bisect.bisect_left(self.lats, s) - margin)
        i1 = min(len(self.lats), bisect.bisect_right(self.lats, n) + margin)
        j0 = max(0, bisect.bisect_left(self.lngs, w) - margin)
        j1 = min(len(self.lngs), bisect.bisect_right(self.lngs, e) + margin)
        return [
            {"lat": self.lats[i], "lng": self.lngs[j], "weight": self.w[i][j]}
            for i in range(i0, i1)
            for j in range(j0, j1)
        ]

    def bilinear(self, lat: float, lng: float) -> float:
        lats, lngs = self.lats, self.lngs
        if not (lats[0] <= lat <= lats[-1] and lngs[0] <= lng <= lngs[-1]):
            return 0.0
        fy = (lat - lats[0]) / (lats[-1] - lats[0]) * (len(lats) - 1)
        fx = (lng - lngs[0]) / (lngs[-1] - lngs[0]) * (len(lngs) - 1)
        i = min(len(lats) - 2, int(fy))
        j = min(len(lngs) - 2, int(fx))
        ty, tx = fy - i, fx - j
        return (
            self.w[i][j] * (1 - tx) * (1 - ty)
            + self.w[i][j + 1] * tx * (1 - ty)
            + self.w[i + 1][j] * (1 - tx) * ty
            + self.w[i + 1][j + 1] * tx * ty
        )


_lattices: dict[tuple[str, int], _Lattice] = {}
_lattice_src: dict[tuple[str, int], str] = {}


async def _lattice(hazard: str, epoch: int) -> tuple[_Lattice, str]:
    key = (hazard, epoch)
    if key not in _lattices:
        points, source = await calibrated_grid(hazard)
        _lattices[key] = _Lattice(points)
        _lattice_src[key] = source
        # keep only the two most recent epochs per hazard
        for k in [k for k in _lattices if k[0] == hazard and k[1] < epoch - 1]:
            _lattices.pop(k, None)
            _lattice_src.pop(k, None)
    return _lattices[key], _lattice_src[key]


def _block_cells(lat0: float, lat1: float, lng0: float, lng1: float, lat_grid: _Lattice) -> list[dict]:
    """100 m lattice for a bbox, downscaled from the parent city lattice.

    Deterministic: parent bilinear value + coordinate-hashed urban texture —
    the same cell always gets the same value, on every tile that contains it.
    """
    cells: list[dict] = []
    lat = math.floor(lat0 / BLOCK_LAT_STEP) * BLOCK_LAT_STEP
    while lat <= lat1:
        lng = math.floor(lng0 / BLOCK_LNG_STEP) * BLOCK_LNG_STEP
        while lng <= lng1:
            base = lat_grid.bilinear(lat, lng)
            if base > 0.02:
                texture = (_hash01(lat, lng) - 0.5) * 0.14 * (0.4 + base)
                cells.append({
                    "lat": round(lat, 6),
                    "lng": round(lng, 6),
                    "weight": round(min(1.0, max(0.0, base + texture)), 3),
                })
            lng += BLOCK_LNG_STEP
        lat += BLOCK_LAT_STEP
    return cells


def _summaries(data: list[dict], hazard: str, w: float, s: float, e: float, n: float) -> list[dict]:
    return [
        {"name": d["name"], "lat": d["lat"], "lng": d["lng"], "value": d[hazard]}
        for d in data
        if s <= d["lat"] <= n and w <= d["lng"] <= e
    ]


def _rivers_in(w: float, s: float, e: float, n: float) -> list[dict]:
    out = []
    for r in TN_RIVERS:
        lngs = [p[0] for p in r["path"]]
        lats = [p[1] for p in r["path"]]
        if max(lngs) >= w and min(lngs) <= e and max(lats) >= s and min(lats) <= n:
            out.append(r)
    return out


def _assets_in(w: float, s: float, e: float, n: float) -> list[dict]:
    return [a for a in CHENNAI_ASSETS if s <= a["lat"] <= n and w <= a["lng"] <= e]


# response cache: (hazard, z, x, y, calibration epoch) → TileResponse
_tile_cache: dict[tuple, TileResponse] = {}


@router.get("/tiles/{hazard}/{z}/{x}/{y}", response_model=TileResponse)
async def tile(
    hazard: Hazard,
    z: int = Path(ge=0, le=22),
    x: int = Path(ge=0),
    y: int = Path(ge=0),
):
    if x >= 2 ** z or y >= 2 ** z:
        return TileResponse(band=band_for_zoom(z), z=z, x=x, y=y, bounds=[0, 0, 0, 0], source="empty")

    epoch = int(time.time() // _CAL_TTL)
    key = (hazard, z, x, y, epoch)
    if key in _tile_cache:
        return _tile_cache[key]

    w, s, e, n = tile_bounds(z, x, y)
    band = band_for_zoom(z)
    resp = TileResponse(band=band, z=z, x=x, y=y, bounds=[w, s, e, n], source="curated-regional-v0")

    if band == "country":
        resp.summaries = [TileSummary(**d) for d in _summaries(INDIA_STATES, hazard, w, s, e, n)]
    elif band == "state":
        resp.summaries = [TileSummary(**d) for d in _summaries(TN_DISTRICTS, hazard, w, s, e, n)]
        resp.rivers = [TileRiver(**r) for r in _rivers_in(w, s, e, n)]
    else:
        lattice, source = await _lattice(hazard, epoch)
        resp.source = source
        resp.extent = lattice.extent
        if band == "city":
            resp.cells = [TileCell(**c) for c in lattice.slice(w, s, e, n)]
        else:  # block / street: 100 m derived cells, clipped to the data extent
            ex = lattice.extent
            lat0, lat1 = max(s, ex[1]), min(n, ex[3])
            lng0, lng1 = max(w, ex[0]), min(e, ex[2])
            if lat0 <= lat1 and lng0 <= lng1:
                pad_lat, pad_lng = 2 * BLOCK_LAT_STEP, 2 * BLOCK_LNG_STEP
                resp.cells = [TileCell(**c) for c in _block_cells(
                    lat0 - pad_lat, lat1 + pad_lat, lng0 - pad_lng, lng1 + pad_lng, lattice)]
            resp.assets = [TileAsset(**a) for a in _assets_in(w, s, e, n)]

    # cheap manual LRU: cap size, drop oldest epoch entries first
    if len(_tile_cache) > 512:
        for k in list(_tile_cache)[:64]:
            _tile_cache.pop(k, None)
    _tile_cache[key] = resp
    return resp
