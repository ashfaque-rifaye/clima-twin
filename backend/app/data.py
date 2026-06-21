"""Local sample-data layer (Chennai).

Lets the whole app run and demo at $0 with no cloud. On Day 1+ this is the
fallback behind a BigQuery-backed implementation with the same shape, so the
swap to real data is transparent.
"""
import json
from pathlib import Path

_DATA = Path(__file__).parent / "sample_data"


def _load(name: str):
    with open(_DATA / name, encoding="utf-8") as f:
        return json.load(f)


GRID: list[dict] = _load("sample_grid.json")
SPECIES: list[dict] = _load("species.json")
SPECIES_BY_KEY: dict[str, dict] = {s["key"]: s for s in SPECIES}


def nearest_cell(lat: float, lng: float) -> dict | None:
    """Nearest sample grid cell by squared lat/lng distance (fine at city scale)."""
    if not GRID:
        return None
    return min(GRID, key=lambda c: (c["lat"] - lat) ** 2 + (c["lng"] - lng) ** 2)
