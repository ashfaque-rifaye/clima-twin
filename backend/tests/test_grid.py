"""/grid: synthetic fallback, live+model blend, honest source labels."""


def test_synthetic_fallback(client):
    r = client.get("/grid?hazard=heat")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "synthetic"
    assert len(body["points"]) > 100
    assert all(0.0 <= p["weight"] <= 1.0 for p in body["points"])


def test_live_blend_source_and_range(client, live_anchors):
    body = client.get("/grid?hazard=heat").json()
    assert body["source"] == "live+model"
    ws = [p["weight"] for p in body["points"]]
    # rank-normalised: full 0..1 spread
    assert min(ws) == 0.0 and max(ws) == 1.0


def test_live_blend_follows_anchor_gradient(client, live_anchors):
    """North-west anchors are hot (1.0), south-east cool (0.0) — the blended
    field must reflect that ordering."""
    pts = client.get("/grid?hazard=heat").json()["points"]

    def region_mean(cond):
        sel = [p["weight"] for p in pts if cond(p)]
        return sum(sel) / len(sel)

    nw = region_mean(lambda p: p["lat"] > 13.1 and p["lng"] < 80.22)
    se = region_mean(lambda p: p["lat"] < 12.95 and p["lng"] > 80.27)
    assert nw > se


def test_all_hazards_serve(client):
    for hz in ("heat", "flood", "air", "green"):
        r = client.get(f"/grid?hazard={hz}")
        assert r.status_code == 200, hz
        assert r.json()["points"], hz
