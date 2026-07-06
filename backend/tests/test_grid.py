"""/grid: live+model blend, hazard display physics, honest source labels."""


def test_synthetic_fallback(client):
    r = client.get("/grid?hazard=heat")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "synthetic"
    assert len(body["points"]) > 100
    assert all(0.0 <= p["weight"] <= 1.0 for p in body["points"])


def test_live_blend_source_label(client, live_anchors):
    body = client.get("/grid?hazard=air").json()
    assert body["source"] == "live+model"
    ws = [p["weight"] for p in body["points"]]
    # air keeps the rank-normalised exposure gradient: full 0..1 spread
    assert min(ws) == 0.0 and max(ws) == 1.0


def test_air_blend_follows_anchor_gradient(client, live_anchors):
    """North-west anchors are hot (1.0), south-east cool (0.0) — the blended
    exposure field must reflect that ordering."""
    pts = client.get("/grid?hazard=air").json()["points"]

    def region_mean(cond):
        sel = [p["weight"] for p in pts if cond(p)]
        return sum(sel) / len(sel)

    nw = region_mean(lambda p: p["lat"] > 13.1 and p["lng"] < 80.22)
    se = region_mean(lambda p: p["lat"] < 12.95 and p["lng"] > 80.27)
    assert nw > se


def test_heat_is_localized_not_citywide(client, live_anchors):
    """UHI physics: heat = local deviation from the neighbourhood, centred at
    0.5 — a bounded minority of cells may deviate strongly. The old renderer
    tinted ~half the city; that must be structurally impossible now."""
    ws = [p["weight"] for p in client.get("/grid?hazard=heat").json()["points"]]
    assert all(0.0 <= w <= 1.0 for w in ws)
    strong_hot = sum(1 for w in ws if w > 0.68) / len(ws)
    assert strong_hot < 0.30, f"{strong_hot:.0%} of city rendered as strong heat island"
    near_neutral = sum(1 for w in ws if abs(w - 0.5) < 0.12) / len(ws)
    assert near_neutral > 0.35, "most of the city should sit near the transparent midpoint"


def test_flood_is_hydrological(client, live_anchors):
    """Flood exists only where terrain + drainage support it: the majority of
    cells must be near-transparent, never a citywide blue tint."""
    ws = [p["weight"] for p in client.get("/grid?hazard=flood").json()["points"]]
    assert all(0.0 <= w <= 1.0 for w in ws)
    low = sum(1 for w in ws if w < 0.25) / len(ws)
    assert low > 0.55, f"only {low:.0%} of cells are low-risk — flood is over-rendered"
    assert max(ws) > 0.5, "risk cores near drainage should still exist"


def test_green_serves_canopy_not_temperature(client):
    """Regression: hazard_weight had no green branch and fell through to
    feels-like temperature."""
    green = client.get("/grid?hazard=green").json()["points"]
    heat = client.get("/grid?hazard=heat").json()["points"]
    gw = [p["weight"] for p in green]
    assert any(w > 0.4 for w in gw), "canopy cores (parks/river buffers) expected"
    assert gw != [p["weight"] for p in heat]
    # value field must be canopy percent, not °C
    assert all((p["value"] or 0) <= 100 for p in green)


def test_all_hazards_serve(client):
    for hz in ("heat", "flood", "air", "green"):
        r = client.get(f"/grid?hazard={hz}")
        assert r.status_code == 200, hz
        assert r.json()["points"], hz
