"""Modeled pollen for locations without live Google Pollen coverage (e.g. India).

Google's Pollen API has no coverage across India, so for the demo city we
estimate tree/grass/weed pollen from a cell's vegetation and built-up density.
It is always labelled ``modeled`` (never presented as a live measurement) — the
same provenance discipline used everywhere else. Values use Google's Universal
Pollen Index 0–5 scale so the response shape matches the live API exactly.
"""
from __future__ import annotations

import math

# Google UPI category labels (0–5).
_CATS = {0: "None", 1: "Very Low", 2: "Low", 3: "Moderate", 4: "High", 5: "Very High"}


def _clamp01(x: float) -> float:
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def _index(x: float) -> int:
    return max(0, min(5, int(round(x * 5))))


def _jitter(cell: dict, salt: float) -> float:
    """Small deterministic per-location variation so neighbours aren't identical."""
    v = math.sin(cell.get("lat", 13.0) * 91.7 + cell.get("lng", 80.2) * 57.3 + salt) * 43758.5453
    return (v - math.floor(v) - 0.5) * 0.15  # ±0.075


def synthetic_pollen(cell: dict) -> dict:
    """Modeled tree/grass/weed pollen for a grid cell. Shape matches the live
    Pollen API block, plus ``modeled: True``."""
    green = float(cell.get("green_cover_pct", 12.0))   # % canopy
    road = float(cell.get("road_pressure", 0.3))       # 0..1 built-up/traffic proxy

    # Tree pollen tracks canopy density; grass favours open low-traffic green;
    # weed favours disturbed low-canopy semi-open ground.
    tree = _clamp01((green - 5.0) / 28.0 + _jitter(cell, 1))
    grass = _clamp01((green / 42.0) * (1 - 0.6 * road) + _jitter(cell, 2))
    weed = _clamp01((1 - green / 34.0) * (1 - 0.5 * road) * 0.8 + _jitter(cell, 3))

    types = [
        {"type": "Tree", "value": _index(tree), "category": _CATS[_index(tree)]},
        {"type": "Grass", "value": _index(grass), "category": _CATS[_index(grass)]},
        {"type": "Weed", "value": _index(weed), "category": _CATS[_index(weed)]},
    ]
    dominant = max(types, key=lambda t: t["value"])
    dv = dominant["value"]
    if dv >= 4:
        health = (f"{dominant['type']} pollen is {dominant['category'].lower()} — sensitive "
                  "groups should limit midday outdoor exposure.")
    elif dv >= 3:
        health = f"{dominant['type']} pollen is moderate — allergy-prone individuals may notice symptoms."
    else:
        health = "Pollen is low — minimal impact expected."

    return {"dominant": dominant, "types": types, "health": health, "modeled": True}
