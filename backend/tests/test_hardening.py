"""Rate limiter unit behaviour + unhandled-error shielding."""
from app.hardening import RateLimiter


def test_rate_limiter_allows_within_budget():
    rl = RateLimiter(per_minute=5)
    assert all(rl.allow("1.2.3.4") for _ in range(5))


def test_rate_limiter_blocks_over_budget():
    rl = RateLimiter(per_minute=5)
    for _ in range(5):
        rl.allow("1.2.3.4")
    assert rl.allow("1.2.3.4") is False


def test_rate_limiter_isolates_clients():
    rl = RateLimiter(per_minute=1)
    assert rl.allow("a")
    assert rl.allow("b")  # different client unaffected
    assert rl.allow("a") is False


def test_unhandled_error_returns_json_500(client, monkeypatch):
    from app.routers import point as point_mod

    def boom(lat, lng):
        raise RuntimeError("kaboom")

    monkeypatch.setattr(point_mod, "realtime_point", boom)
    r = client.get("/point?lat=13.0&lng=80.2")
    assert r.status_code == 500
    assert r.json() == {"detail": "Internal server error."}
