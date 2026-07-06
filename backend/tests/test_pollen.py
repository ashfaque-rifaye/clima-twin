"""/point surfaces the live Pollen block when available, and omits it cleanly
when the Pollen API returns nothing (uneven coverage / restriction lag)."""
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


def test_point_omits_pollen_when_unavailable(client, monkeypatch):
    _patch_realtime(monkeypatch, None)
    body = client.get("/point?lat=13.04&lng=80.23").json()
    assert body["pollen"] is None
    assert "no data" in body["sources"]["pollen"]
