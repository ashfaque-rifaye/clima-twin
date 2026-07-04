"""Shared fixtures. All external Google/Gemini calls are mocked — the suite
must run offline, deterministically, and burn zero API quota.

Routers bind imported names at import time (`from ..gemini import generate`),
so patches target the router modules, not the source modules.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import ask as ask_mod
from app.routers import grid as grid_mod
from app.routers import point as point_mod
from app.routers import proposal as proposal_mod
from app.routers import recommend as recommend_mod

FAKE_REALTIME = {
    "weather": {"temp_c": 33.0, "feels_like_c": 39.5, "humidity": 68, "condition": "Sunny", "rain_prob": 5},
    "air": {"aqi": 92, "category": "Moderate", "dominant": "pm25", "health": "Limit outdoor exertion."},
    "forecast": [{"feels_like_c": 40.1, "rain_prob": 10}],
    "name": "T. Nagar",
    "elevation": 11.2,
    "live": True,
}


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    """Default state: live APIs reachable-but-mocked, Gemini unavailable."""
    monkeypatch.setattr(point_mod, "realtime_point", lambda lat, lng: FAKE_REALTIME)
    monkeypatch.setattr(point_mod, "gemini_available", lambda: False)
    monkeypatch.setattr(point_mod, "generate", lambda *a, **k: None)

    async def no_anchors(hazard, n=8):
        return []

    monkeypatch.setattr(grid_mod, "hazard_grid", no_anchors)

    for mod in (ask_mod, recommend_mod, proposal_mod):
        monkeypatch.setattr(mod, "gemini_available", lambda: False)
        monkeypatch.setattr(mod, "generate", lambda *a, **k: None)
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def live_anchors(monkeypatch):
    """Four live anchors: hot in the north-west, cool in the south-east."""
    anchors = [
        {"lat": 13.20, "lng": 80.16, "weight": 1.0},
        {"lat": 13.20, "lng": 80.33, "weight": 0.7},
        {"lat": 12.86, "lng": 80.16, "weight": 0.3},
        {"lat": 12.86, "lng": 80.33, "weight": 0.0},
    ]

    async def fake(hazard, n=8):
        return anchors

    monkeypatch.setattr(grid_mod, "hazard_grid", fake)
    return anchors
