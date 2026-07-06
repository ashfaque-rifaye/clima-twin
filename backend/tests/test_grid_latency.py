"""hazard_grid must be non-blocking: instant reads, live anchors refreshed in
the background (deck: 'instant reads; live calls only for the selected point')."""
import asyncio
import time

import app.realtime as rt


def test_fresh_cache_returns_instantly():
    rt._grid_cache["heat"] = (time.time(), [{"lat": 13.0, "lng": 80.0, "weight": 0.5}])
    out = asyncio.run(rt.hazard_grid("heat"))
    assert out == [{"lat": 13.0, "lng": 80.0, "weight": 0.5}]


def test_cold_cache_without_key_is_instant_empty(monkeypatch):
    rt._grid_cache.pop("air", None)
    rt._refreshing.discard("air")
    monkeypatch.setattr(rt, "_key", lambda: "")  # no key → no scheduling
    assert asyncio.run(rt.hazard_grid("air")) == []


def test_cold_cache_schedules_background_refresh(monkeypatch):
    async def scenario():
        rt._grid_cache.pop("heat", None)
        rt._refreshing.discard("heat")
        monkeypatch.setattr(rt, "_key", lambda: "k")

        called = {}

        async def fake_compute(hazard, n):
            called["hit"] = True
            return [{"lat": 13.0, "lng": 80.0, "weight": 0.9}]

        monkeypatch.setattr(rt, "_compute_hazard_grid", fake_compute)

        first = await rt.hazard_grid("heat")   # instant — does not block on live fan-out
        assert first == []
        await asyncio.sleep(0.05)              # let the background refresh land
        second = await rt.hazard_grid("heat")
        assert called.get("hit") is True
        assert second and second[0]["weight"] == 0.9

    asyncio.run(scenario())
    rt._grid_cache.pop("heat", None)  # cleanup
