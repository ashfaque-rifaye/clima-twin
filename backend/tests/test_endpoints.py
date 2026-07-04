"""Happy paths + fallback behaviour for the decision endpoints."""


def test_point_uses_live_data(client):
    body = client.get("/point?lat=13.0417&lng=80.2341").json()
    assert body["live"] is True
    assert body["area_name"] == "T. Nagar"
    assert body["heat"]["feels_like_c"] == 39.5
    assert body["air"]["aqi"] == 92
    assert body["elevation_m"] == 11.2
    assert body["vulnerability"]  # synthetic urban-form context still attached


def test_simulate_cooling_effect(client):
    body = client.post("/simulate", json={
        "lat": 13.0417, "lng": 80.2341,
        "interventions": [{"type": "tree", "species": "pungai", "count": 80},
                          {"type": "cool_roof", "species": "cool_roof", "count": 6}],
        "budget_inr": 500_000,
    }).json()
    assert body["delta_feels_like_c"] > 0
    assert body["people_helped"] > 0
    assert body["cost_inr"] > 0
    assert body["projected_feels_like_c"] < body["baseline_feels_like_c"]
    assert isinstance(body["what_could_go_wrong"], list) and body["what_could_go_wrong"]


def test_simulate_over_budget_flag(client):
    body = client.post("/simulate", json={
        "lat": 13.0417, "lng": 80.2341,
        "interventions": [{"type": "tree", "species": "pungai", "count": 5000}],
        "budget_inr": 1000,
    }).json()
    assert body["over_budget"] is True


def test_recommend_rule_based_fallback(client):
    body = client.post("/recommend", json={
        "lat": 13.0417, "lng": 80.2341, "goal": "reduce heat for commuters",
    }).json()
    assert body["source"] == "rule-based"  # Gemini mocked out
    assert body["interventions"]
    assert body["rationale"]
    assert body["effect"]["delta_feels_like_c"] >= 0


def test_recommend_respects_budget(client):
    tight = client.post("/recommend", json={
        "lat": 13.0417, "lng": 80.2341, "goal": "reduce heat", "budget_inr": 100_000,
    }).json()
    assert tight["effect"]["cost_inr"] <= 100_000 or tight["interventions"][0]["count"] <= 10


def test_ask_offline_fallback(client):
    body = client.post("/ask", json={"question": "Which area is hottest?"}).json()
    assert body["source"] == "offline"
    assert "Hottest:" in body["answer"]


def test_proposal_template_fallback(client):
    body = client.post("/proposal", json={
        "area_name": "T. Nagar",
        "plan": {"effect": {"delta_feels_like_c": 4.2, "people_helped": 1800, "cost_inr": 250000,
                            "baseline_feels_like_c": 43.1, "what_could_go_wrong": ["water stress"]}},
    }).json()
    assert body["source"] == "template"
    assert "T. Nagar" in body["title"]
    assert "## Problem" in body["markdown"]


def test_hotspots_ranked_and_limited(client):
    body = client.get("/hotspots?hazard=heat&limit=6").json()
    spots = body["hotspots"]
    assert len(spots) == 6
    scores = [s["priority_score"] for s in spots]
    assert scores == sorted(scores, reverse=True)
    assert all(s["why"] for s in spots)
