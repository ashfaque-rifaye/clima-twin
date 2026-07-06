"""When Gemini is available, /recommend and /proposal consume schema-validated
JSON (not free prose). Offline fallbacks are covered in test_endpoints.py."""
from app.routers import proposal as proposal_mod
from app.routers import recommend as recommend_mod


def test_recommend_consumes_structured_json(client, monkeypatch):
    monkeypatch.setattr(recommend_mod, "gemini_available", lambda: True)
    monkeypatch.setattr(recommend_mod, "generate_json",
                        lambda *a, **k: {"rationale": "Shade + canopy fit this hot bus corridor.",
                                         "trade_offs": ["Water the saplings through summer."]})

    body = client.post("/recommend", json={
        "lat": 13.0417, "lng": 80.2341, "goal": "reduce heat for commuters",
    }).json()

    assert body["source"] == "gemini"
    assert body["rationale"].startswith("Shade + canopy")
    assert "Water the saplings through summer." in body["trade_offs"]
    # deterministic provenance still present
    assert body["effect"]["citations"]


def test_recommend_falls_back_when_json_missing_rationale(client, monkeypatch):
    monkeypatch.setattr(recommend_mod, "gemini_available", lambda: True)
    monkeypatch.setattr(recommend_mod, "generate_json", lambda *a, **k: None)

    body = client.post("/recommend", json={
        "lat": 13.0417, "lng": 80.2341, "goal": "reduce heat",
    }).json()
    assert body["source"] == "rule-based"
    assert body["rationale"]


def test_proposal_renders_structured_sections(client, monkeypatch):
    monkeypatch.setattr(proposal_mod, "gemini_available", lambda: True)
    monkeypatch.setattr(proposal_mod, "generate_json", lambda *a, **k: {
        "problem": "T. Nagar runs hot with low canopy.",
        "intervention": "80 pungai + 2 shade sails.",
        "expected_impact": "About 4C cooler for ~2000 commuters.",
        "cost": "Rs 4,20,000",
        "risks": ["Summer watering"],
        "recommendation": "Approve as a reversible pilot.",
    })

    body = client.post("/proposal", json={
        "area_name": "T. Nagar",
        "plan": {"effect": {"delta_feels_like_c": 4.0}},
    }).json()

    assert body["source"] == "gemini"
    md = body["markdown"]
    assert "## Problem" in md and "T. Nagar runs hot" in md
    assert "## Recommendation" in md and "reversible pilot" in md
    assert "- Summer watering" in md
