"""/point surfaces the live Pollen block when available, and falls back to a
clearly-labelled MODELED block where Google Pollen has no coverage (India)."""
from app.pollen_model import synthetic_pollen
from app.routers import point as point_mod

_BASE = {
    "weather": {"feels_like_c": 39.5, "temp_c": 33.0, "condition": "Sunny", "humidity": 68, "rain_prob": 5},
    "air": {"aqi": 92, "category": "Moderate", "dominant": "pm25", "health": "Limit exertion."},
    "forecast": [{"feels_like_c": 40.1, "rain_prob": 10}],
    "name": "T. Nagar", "elevation": 11.2, "live": True,
}


def _patch_realtime(monkeypatch, pollen):
    data = {**_BASE, "pollen": pollen}

    async def fake(lat, lng):
        return data

    monkeypatch.setattr(point_mod, "realtime_point", fake)


def test_point_surfaces_pollen_when_available(client, monkeypatch):
    _patch_realtime(monkeypatch, {
        "dominant": {"type": "Grass", "value": 3, "category": "Moderate"},
        "types": [{"type": "Grass", "value": 3, "category": "Moderate"}],
        "health": "Sensitive groups should limit outdoor time.",
    })
    body = client.get("/point?lat=13.04&lng=80.23").json()
    assert body["pollen"]["dominant"]["type"] == "Grass"
    assert body["sources"]["pollen"].startswith("Google Pollen API (live)")


def test_point_falls_back_to_modeled_pollen(client, monkeypatch):
    _patch_realtime(monkeypatch, None)  # no live coverage (India)
    body = client.get("/point?lat=13.04&lng=80.23").json()
    assert body["pollen"] is not None
    assert body["pollen"]["modeled"] is True
    assert {t["type"] for t in body["pollen"]["types"]} == {"Tree", "Grass", "Weed"}
    assert body["sources"]["pollen"].startswith("modeled")


def test_synthetic_pollen_shape_and_bounds():
    cell = {"lat": 13.04, "lng": 80.23, "green_cover_pct": 28.0, "road_pressure": 0.4}
    p = synthetic_pollen(cell)
    assert p["modeled"] is True
    assert all(0 <= t["value"] <= 5 for t in p["types"])
    assert p["dominant"]["value"] == max(t["value"] for t in p["types"])
    assert p["health"]


def test_synthetic_pollen_is_deterministic():
    cell = {"lat": 13.06, "lng": 80.25, "green_cover_pct": 15.0, "road_pressure": 0.6}
    assert synthetic_pollen(cell) == synthetic_pollen(cell)
