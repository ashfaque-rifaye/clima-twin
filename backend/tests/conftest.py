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
from app.routers import optimize as optimize_mod
from app.routers import proposal as proposal_mod
from app.routers import recommend as recommend_mod
from app.routers import scenarios as scenarios_mod
from app.data_access.scenarios import InMemoryScenarioStore

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
    async def fake_realtime(lat, lng):
        return FAKE_REALTIME

    monkeypatch.setattr(point_mod, "realtime_point", fake_realtime)

    async def no_anchors(hazard, n=8):
        return []

    monkeypatch.setattr(grid_mod, "hazard_grid", no_anchors)

    for mod in (ask_mod, recommend_mod, proposal_mod, optimize_mod):
        monkeypatch.setattr(mod, "gemini_available", lambda: False)
        # Patch both AI entrypoints regardless of which a module imports, so the
        # suite stays fully offline no matter how routers evolve.
        monkeypatch.setattr(mod, "generate", lambda *a, **k: None, raising=False)
        monkeypatch.setattr(mod, "generate_json", lambda *a, **k: None, raising=False)

    # Scenario persistence uses in-memory in tests (no live Firestore calls).
    monkeypatch.setattr(scenarios_mod, "_store", InMemoryScenarioStore())

    # Report generation: no live Gemini, no static-map network in tests.
    from app import report as report_mod
    monkeypatch.setattr(report_mod, "gemini_available", lambda: False)
    monkeypatch.setattr(report_mod, "_static_map", lambda *a, **k: None)
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
