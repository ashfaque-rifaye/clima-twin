"""Explainability contract: every simulated headline number carries an
uncertainty band, and every coefficient used carries a literature citation
(deck S2/S3/S5 — 'confidence bands + cited coefficients on every number')."""


def test_simulate_returns_confidence_bands(client):
    body = client.post("/simulate", json={
        "lat": 13.0417, "lng": 80.2341,
        "interventions": [{"type": "tree", "species": "pungai", "count": 80},
                          {"type": "shade", "species": "shade_sail", "count": 2}],
    }).json()

    conf = body["confidence_detail"]
    assert conf is not None
    band = conf["delta_feels_like_c"]
    assert band["low"] <= band["expected"] <= band["high"]
    assert 0 < band["rel_uncertainty"] < 1
    ppl = conf["people_helped"]
    assert ppl["low"] <= ppl["expected"] <= ppl["high"]


def test_simulate_cites_every_coefficient_used(client):
    body = client.post("/simulate", json={
        "lat": 13.0417, "lng": 80.2341,
        "interventions": [{"type": "tree", "species": "pungai", "count": 80},
                          {"type": "shade", "species": "shade_sail", "count": 2}],
    }).json()

    cites = body["citations"]
    assert len(cites) == 2  # one per distinct coefficient used
    factors = {c["factor"] for c in cites}
    assert any("Pungai" in f for f in factors)
    assert all(c["source"] and c["coefficient_c_per_unit"] is not None for c in cites)


def test_zero_count_intervention_is_not_cited(client):
    body = client.post("/simulate", json={
        "lat": 13.0417, "lng": 80.2341,
        "interventions": [{"type": "tree", "species": "pungai", "count": 0}],
    }).json()
    assert body["citations"] == []


def test_recommend_effect_carries_provenance(client):
    body = client.post("/recommend", json={
        "lat": 13.0417, "lng": 80.2341, "goal": "reduce heat for commuters",
    }).json()
    eff = body["effect"]
    assert eff["citations"]  # rule-based mix still cites its coefficients
    assert eff["confidence"]["delta_feels_like_c"]["expected"] >= 0
