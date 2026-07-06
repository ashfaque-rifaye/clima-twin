"""Context-aware intervention libraries + multi-metric simulate output."""


def test_each_hazard_has_its_own_library(client):
    cats = {}
    for hz in ("heat", "flood", "air", "green"):
        body = client.get(f"/interventions?hazard={hz}").json()
        assert body["hazard"] == hz
        assert body["count"] >= 8, hz
        keys = {i["key"] for i in body["interventions"]}
        cats[hz] = keys
        assert all(i["capital_inr"] > 0 for i in body["interventions"]), hz
        assert all(i["primary_metric"] for i in body["interventions"]), hz

    # the libraries are genuinely different per hazard
    assert cats["heat"] != cats["flood"] != cats["air"] != cats["green"]
    assert "rain_garden" in cats["flood"] and "rain_garden" not in cats["air"]
    assert "low_emission_zone" in cats["air"]
    assert "urban_forest" in cats["green"]


def test_flood_simulate_reports_flood_metric(client):
    body = client.post("/simulate", json={
        "lat": 12.9755, "lng": 80.2207,  # Velachery (flood-prone)
        "interventions": [{"type": "rain_garden", "species": "rain_garden", "count": 6},
                          {"type": "permeable", "species": "permeable", "count": 200}],
    }).json()
    imp = body["impacts"]
    assert imp["flood_managed_m3"] > 0
    assert body["flood_change"] and "m³" in body["flood_change"]
    assert body["costs"]["capital_inr"] > 0
    assert body["costs"]["ten_year_inr"] >= body["costs"]["five_year_inr"] >= body["costs"]["capital_inr"]


def test_air_simulate_reports_aqi_metric(client):
    body = client.post("/simulate", json={
        "lat": 13.0694, "lng": 80.1948,  # Koyambedu
        "interventions": [{"type": "policy", "species": "low_emission_zone", "count": 1},
                          {"type": "tree", "species": "street_tree_barrier", "count": 100}],
    }).json()
    assert body["impacts"]["aqi_improvement"] > 0
    assert body["air_quality_change"] and "AQI" in body["air_quality_change"]


def test_green_simulate_reports_canopy_and_carbon(client):
    body = client.post("/simulate", json={
        "lat": 13.0012, "lng": 80.2565,
        "interventions": [{"type": "forest", "species": "urban_forest", "count": 2},
                          {"type": "tree", "species": "canopy_gap_filling", "count": 100}],
    }).json()
    assert body["impacts"]["canopy_added_m2"] > 0
    assert body["impacts"]["carbon_seq_kg_year"] > 0


def test_legacy_keys_still_resolve(client):
    # existing frontend palette keys must keep working
    body = client.post("/simulate", json={
        "lat": 13.0417, "lng": 80.2341,
        "interventions": [{"type": "tree", "species": "pungai", "count": 80},
                          {"type": "cool_roof", "species": "cool_roof", "count": 6}],
    }).json()
    assert body["delta_feels_like_c"] > 0
    assert body["cost_inr"] > 0
