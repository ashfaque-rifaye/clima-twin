"""Budget optimizer (Workflow B): fixed budget → best diversified plan."""


def test_optimize_fits_budget_and_diversifies(client):
    body = client.post("/optimize", json={
        "lat": 13.0417, "lng": 80.2341, "hazard": "heat", "budget_inr": 2_000_000,
    }).json()
    assert body["hazard"] == "heat"
    assert len(body["interventions"]) >= 2  # diversified, not a monoculture
    assert body["budget"]["allocated_inr"] <= 2_000_000
    assert body["budget"]["over_budget"] is False
    assert 0 < body["budget"]["utilization_pct"] <= 100
    assert body["impacts"]["temp_reduction_c"] > 0
    for iv in body["interventions"]:
        assert iv["why"] and iv["capital_inr"] > 0


def test_optimize_reports_roi_and_assumptions(client):
    body = client.post("/optimize", json={
        "lat": 13.0417, "lng": 80.2341, "hazard": "heat", "budget_inr": 5_000_000,
    }).json()
    assert body["roi"]["primary_metric"]
    assert body["roi"]["people_per_lakh"] >= 0
    assert body["assumptions"] and len(body["assumptions"]) >= 2
    assert body["source"] == "rule-based"  # Gemini mocked offline
    assert body["confidence"] is not None


def test_optimize_respects_hazard_library(client):
    flood = client.post("/optimize", json={
        "lat": 12.9755, "lng": 80.2207, "hazard": "flood", "budget_inr": 10_000_000,
    }).json()
    species = {i["species"] for i in flood["interventions"]}
    # flood plan draws only from the flood library
    assert species and species.issubset({
        "rain_garden", "permeable", "detention_basin", "retention_pond",
        "stormwater_harvesting", "drain_widening", "bioswale", "canal_restoration",
        "constructed_wetland", "flood_barrier", "pump_station",
    })
    assert flood["impacts"]["flood_managed_m3"] > 0


def test_optimize_tiny_budget_degrades_gracefully(client):
    body = client.post("/optimize", json={
        "lat": 13.0417, "lng": 80.2341, "hazard": "heat", "budget_inr": 100,
    }).json()
    # nothing fits ₹100 — return an empty, non-crashing plan
    assert body["interventions"] == []
    assert body["budget"]["allocated_inr"] == 0
