"""Local synthetic-data layer for Chennai.

The hackathon prototype needs to work even when live city-scale feeds are not
available. This module generates a deterministic 30x30 grid (900 cells) with
plausible heat, flood, air, population, canopy, elevation and data-density
signals. It is intentionally shaped by Chennai geography instead of random
scatter: coast, Cooum, Adyar, Buckingham Canal, Pallikaranai wetland, major
roads, market cores and industrial areas all influence the scores.

The API shape is kept close to the future BigQuery grid so it can be swapped
for real data later without changing the frontend contract.
"""
from __future__ import annotations

import json
from math import exp, floor, sin, sqrt
from pathlib import Path

_DATA = Path(__file__).parent / "sample_data"

# Chennai bounding box: lat_min, lat_max, lng_min, lng_max
CHENNAI_BBOX = (12.84, 13.24, 80.15, 80.34)
GRID_SIZE = 30


def _load(name: str):
    with open(_DATA / name, encoding="utf-8") as f:
        return json.load(f)


SAMPLE_GRID: list[dict] = _load("sample_grid.json")
# Context-aware intervention catalogue (per-hazard libraries, multi-metric
# coefficients). Supersedes the old species.json; legacy keys are retained so
# existing /simulate and /recommend calls keep resolving.
INTERVENTIONS: list[dict] = _load("interventions.json")
SPECIES: list[dict] = INTERVENTIONS  # backward-compatible alias
SPECIES_BY_KEY: dict[str, dict] = {s["key"]: s for s in INTERVENTIONS}


def interventions_for(hazard: str) -> list[dict]:
    """Interventions whose primary hazard matches (the per-mode library)."""
    return [i for i in INTERVENTIONS if i.get("hazard") == hazard]


ANCHORS = [
    {"name": "T. Nagar", "lat": 13.0418, "lng": 80.2341, "heat": 1.00, "aqi": 0.55, "flood": 0.30, "canopy": 8, "pop": 14200, "commuters": 1800},
    {"name": "Velachery", "lat": 12.9755, "lng": 80.2207, "heat": 0.62, "aqi": 0.38, "flood": 0.90, "canopy": 14, "pop": 11800, "commuters": 1300},
    {"name": "Marina / Triplicane", "lat": 13.0500, "lng": 80.2824, "heat": 0.44, "aqi": 0.30, "flood": 0.60, "canopy": 10, "pop": 9600, "commuters": 1500},
    {"name": "Adyar", "lat": 13.0012, "lng": 80.2565, "heat": 0.20, "aqi": 0.20, "flood": 0.58, "canopy": 28, "pop": 8700, "commuters": 900},
    {"name": "Mylapore", "lat": 13.0337, "lng": 80.2687, "heat": 0.52, "aqi": 0.44, "flood": 0.34, "canopy": 12, "pop": 10200, "commuters": 1100},
    {"name": "Anna Nagar", "lat": 13.0850, "lng": 80.2101, "heat": 0.72, "aqi": 0.58, "flood": 0.20, "canopy": 11, "pop": 12500, "commuters": 1400},
    {"name": "Guindy Industrial Estate", "lat": 13.0067, "lng": 80.2206, "heat": 0.84, "aqi": 0.72, "flood": 0.45, "canopy": 16, "pop": 7300, "commuters": 1700},
    {"name": "Sholinganallur / OMR", "lat": 12.9010, "lng": 80.2279, "heat": 0.74, "aqi": 0.42, "flood": 0.86, "canopy": 13, "pop": 9100, "commuters": 2100},
    {"name": "Koyambedu", "lat": 13.0694, "lng": 80.1948, "heat": 0.92, "aqi": 0.78, "flood": 0.36, "canopy": 7, "pop": 9800, "commuters": 2600},
    {"name": "Perambur", "lat": 13.1192, "lng": 80.2329, "heat": 0.68, "aqi": 0.64, "flood": 0.42, "canopy": 12, "pop": 11200, "commuters": 1250},
    {"name": "Royapuram", "lat": 13.1137, "lng": 80.2954, "heat": 0.66, "aqi": 0.86, "flood": 0.72, "canopy": 6, "pop": 10600, "commuters": 1600},
    {"name": "Ambattur Industrial Estate", "lat": 13.0983, "lng": 80.1622, "heat": 0.82, "aqi": 0.82, "flood": 0.30, "canopy": 10, "pop": 10800, "commuters": 1900},
    {"name": "Pallikaranai Marsh Edge", "lat": 12.9377, "lng": 80.2154, "heat": 0.48, "aqi": 0.26, "flood": 1.00, "canopy": 18, "pop": 6900, "commuters": 720},
    {"name": "Tambaram", "lat": 12.9249, "lng": 80.1000, "heat": 0.46, "aqi": 0.34, "flood": 0.38, "canopy": 22, "pop": 9800, "commuters": 1100},
    {"name": "Porur", "lat": 13.0358, "lng": 80.1583, "heat": 0.58, "aqi": 0.36, "flood": 0.34, "canopy": 18, "pop": 9200, "commuters": 1000},
    {"name": "Egmore / Central", "lat": 13.0827, "lng": 80.2707, "heat": 0.78, "aqi": 0.70, "flood": 0.55, "canopy": 9, "pop": 12000, "commuters": 3000},
    {"name": "Nungambakkam", "lat": 13.0604, "lng": 80.2496, "heat": 0.64, "aqi": 0.52, "flood": 0.34, "canopy": 15, "pop": 10300, "commuters": 1200},
    {"name": "Saidapet", "lat": 13.0213, "lng": 80.2231, "heat": 0.70, "aqi": 0.48, "flood": 0.66, "canopy": 13, "pop": 10100, "commuters": 1450},
]

# Approximate linework. These are not survey-grade geometries; they shape the
# synthetic field so flood/air/heat overlays follow Chennai's recognizable city
# structure instead of arbitrary diagonals.
WATERWAYS = [
    [(13.070, 80.150), (13.068, 80.182), (13.066, 80.214), (13.070, 80.248), (13.078, 80.292)],  # Cooum
    [(13.006, 80.150), (13.000, 80.186), (13.002, 80.220), (13.010, 80.254), (13.016, 80.300)],  # Adyar
    [(12.890, 80.282), (12.950, 80.284), (13.015, 80.287), (13.080, 80.291), (13.145, 80.295)],  # Buckingham Canal
]

MAJOR_ROADS = [
    [(13.082, 80.270), (13.060, 80.258), (13.035, 80.244), (13.010, 80.222)],  # Anna Salai
    [(12.890, 80.226), (12.930, 80.228), (12.975, 80.231), (13.020, 80.245)],  # OMR / IT corridor
    [(12.910, 80.110), (12.950, 80.150), (12.990, 80.185), (13.035, 80.218)],  # GST / airport approach
    [(13.100, 80.162), (13.083, 80.188), (13.070, 80.220), (13.060, 80.250)],  # Inner ring / market movement
    [(13.114, 80.296), (13.095, 80.284), (13.082, 80.270), (13.065, 80.248)],  # Port to central freight
]

PALLIKARANAI = (12.930, 80.215)
MANALI_PORT = (13.160, 80.285)


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    x = (lng2 - lng1) * 111.0
    y = (lat2 - lat1) * 111.0
    return sqrt(x * x + y * y)


def _dist_to_segment_km(lat: float, lng: float, a: tuple[float, float], b: tuple[float, float]) -> float:
    ax, ay = a[1], a[0]
    bx, by = b[1], b[0]
    px, py = lng, lat
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    if denom == 0:
        return _km(lat, lng, ay, ax)
    t = _clamp(((px - ax) * dx + (py - ay) * dy) / denom, 0.0, 1.0)
    return _km(lat, lng, ay + t * dy, ax + t * dx)


def _dist_to_polyline_km(lat: float, lng: float, line: list[tuple[float, float]]) -> float:
    return min(_dist_to_segment_km(lat, lng, line[i], line[i + 1]) for i in range(len(line) - 1))


def _proximity(distance_km: float, radius_km: float) -> float:
    return exp(-((distance_km / radius_km) ** 2))


def _noise(lat: float, lng: float, salt: float = 0.0) -> float:
    raw = sin(lat * 928.17 + lng * 371.41 + salt * 53.11) * 43758.5453
    return raw - floor(raw)


def _nearest_anchor(lat: float, lng: float) -> tuple[dict, float]:
    anchor = min(ANCHORS, key=lambda a: _km(lat, lng, a["lat"], a["lng"]))
    return anchor, _km(lat, lng, anchor["lat"], anchor["lng"])


def _risk_label(score: float) -> str:
    if score >= 0.66:
        return "high"
    if score >= 0.40:
        return "medium"
    return "low"


def _density_label(lat: float, lng: float, data_gap: float) -> str:
    center_dist = _km(lat, lng, 13.060, 80.245)
    if data_gap > 0.62 or center_dist > 18:
        return "low"
    if data_gap > 0.35 or center_dist > 11:
        return "medium"
    return "high"


def _build_synthetic_grid(size: int = GRID_SIZE) -> list[dict]:
    lat_min, lat_max, lng_min, lng_max = CHENNAI_BBOX
    grid: list[dict] = []
    for i in range(size):
        lat = lat_min + (lat_max - lat_min) * i / (size - 1)
        for j in range(size):
            lng = lng_min + (lng_max - lng_min) * j / (size - 1)
            anchor, anchor_dist = _nearest_anchor(lat, lng)

            water_dist = min(_dist_to_polyline_km(lat, lng, w) for w in WATERWAYS)
            road_dist = min(_dist_to_polyline_km(lat, lng, r) for r in MAJOR_ROADS)
            river = _proximity(water_dist, 1.0)
            road = _proximity(road_dist, 0.9)
            wetland = _proximity(_km(lat, lng, *PALLIKARANAI), 4.2)
            port_industrial = _proximity(_km(lat, lng, *MANALI_PORT), 8.0)
            local = _proximity(anchor_dist, 4.5)
            coast = _clamp((lng - 80.255) / 0.07, 0.0, 1.0)
            west_high_ground = _clamp((80.285 - lng) / 0.14, 0.0, 1.0)
            texture = _noise(lat, lng, 1)
            data_gap = _noise(lat, lng, 7)

            canopy = _clamp(
                anchor["canopy"] * (0.55 + 0.45 * local)
                + 8 * wetland
                + 7 * west_high_ground
                - 7 * road
                - 5 * anchor["heat"]
                + (texture - 0.5) * 8,
                3,
                42,
            )
            impervious = _clamp(0.25 + 0.34 * anchor["heat"] + 0.30 * road + 0.18 * local - canopy / 140, 0.10, 0.96)
            elevation_m = _clamp(
                2.4
                + 16.5 * west_high_ground
                - 5.5 * river
                - 6.0 * wetland
                - 3.5 * coast
                + (texture - 0.5) * 4,
                0.2,
                28,
            )
            flood_score = _clamp(
                0.34 * (1 - elevation_m / 28)
                + 0.24 * river
                + 0.20 * wetland
                + 0.12 * coast
                + 0.20 * anchor["flood"] * local,
                0.02,
                1.0,
            )
            surface_temp = _clamp(
                34.2
                + 8.0 * impervious
                + 2.4 * road
                + 2.8 * anchor["heat"] * local
                - 0.075 * canopy
                - 1.2 * coast
                + (texture - 0.5) * 2.0,
                31.5,
                46.5,
            )
            feels_like = _clamp(surface_temp + 2.7 + 2.0 * coast + 0.9 * flood_score - 0.03 * canopy, 33.0, 50.5)
            aqi = int(_clamp(
                62
                + 70 * road
                + 48 * anchor["aqi"] * local
                + 42 * port_industrial
                + 15 * impervious
                - 0.45 * canopy
                + (texture - 0.5) * 24,
                42,
                238,
            ))
            population = int(_clamp(anchor["pop"] * (0.45 + 0.70 * local) + 2300 * road + 900 * impervious, 1800, 22000))
            commuters = int(_clamp(anchor["commuters"] * (0.35 + 0.85 * local) + 1800 * road + 250 * port_industrial, 120, 4200))
            elderly_pct = round(_clamp(5.0 + 7.5 * _noise(lat, lng, 12) + 2.0 * west_high_ground - 1.0 * road, 3.5, 18.0), 1)
            data_density = _density_label(lat, lng, data_gap)

            grid.append({
                "id": f"c{i:02d}_{j:02d}",
                "name": anchor["name"],
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "surface_temp_c": round(surface_temp, 1),
                "feels_like_c": round(feels_like, 1),
                "ndvi": round(_clamp(canopy / 78 + 0.02 * _noise(lat, lng, 20), 0.04, 0.58), 2),
                "green_cover_pct": round(canopy, 1),
                "air_quality_index": aqi,
                "dominant_pollutant": "NO2" if road > 0.58 else "PM2.5" if aqi > 125 else "PM10",
                "flood_risk": _risk_label(flood_score),
                "flood_score": round(flood_score, 3),
                "elevation_m": round(elevation_m, 1),
                "population": population,
                "bus_commuters_daily": commuters,
                "elderly_pct": elderly_pct,
                "data_density": data_density,
                "road_pressure": round(road, 3),
                "waterway_proximity": round(river, 3),
            })
    return grid


GRID: list[dict] = _build_synthetic_grid()


def nearest_cell(lat: float, lng: float) -> dict | None:
    """Nearest synthetic grid cell by squared lat/lng distance."""
    if not GRID:
        return None
    return min(GRID, key=lambda c: (c["lat"] - lat) ** 2 + (c["lng"] - lng) ** 2)


def hazard_weight(cell: dict, hazard: str) -> float:
    if hazard == "flood":
        return _clamp(float(cell.get("flood_score", 0)), 0.0, 1.0)
    if hazard == "air":
        return _clamp((float(cell.get("air_quality_index", 0)) - 55) / 170, 0.0, 1.0)
    if hazard == "green":
        # canopy density (NDVI proxy) — NOT temperature (was a fall-through bug)
        return _clamp(float(cell.get("green_cover_pct", 0)) / 55.0, 0.0, 1.0)
    return _clamp((float(cell.get("feels_like_c", 0)) - 35) / 14, 0.0, 1.0)


def grid_points(hazard: str = "heat", size: int = GRID_SIZE) -> list[dict]:
    """Weighted grid points for frontend map overlays."""
    if size >= GRID_SIZE:
        cells = GRID
    else:
        stride = max(1, round(GRID_SIZE / max(size, 2)))
        cells = [
            c for c in GRID
            if int(c["id"][1:3]) % stride == 0 and int(c["id"][4:6]) % stride == 0
        ]

    value_key = {
        "heat": "feels_like_c",
        "flood": "flood_score",
        "air": "air_quality_index",
        "green": "green_cover_pct",
    }.get(hazard, "feels_like_c")
    return [
        {
            "lat": c["lat"],
            "lng": c["lng"],
            "weight": round(hazard_weight(c, hazard), 3),
            "value": c.get(value_key),
            "name": c["name"],
            "flood_risk": c.get("flood_risk"),
            "aqi": c.get("air_quality_index"),
            "feels_like_c": c.get("feels_like_c"),
            "waterway_proximity": c.get("waterway_proximity"),
        }
        for c in cells
    ]
