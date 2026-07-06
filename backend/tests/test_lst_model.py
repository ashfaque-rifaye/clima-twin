"""Trained LST model: in-process prediction correctness, graceful absence, and
its exposure via /model and /point."""
from app.ml.lst_model import LSTModel


def test_predict_is_linear_combo():
    card = {"intercept": 40.0, "weights": {"green_cover_pct": -0.2, "road_pressure": 5.0},
            "features": ["green_cover_pct", "road_pressure"]}
    m = LSTModel(card)
    assert m.available is True
    # 40 + (-0.2 * 10) + (5.0 * 0.5) = 40 - 2 + 2.5 = 40.5
    assert m.predict({"green_cover_pct": 10, "road_pressure": 0.5}) == 40.5


def test_predict_none_when_unavailable():
    m = LSTModel(None)
    assert m.available is False
    assert m.predict({"green_cover_pct": 10}) is None
    assert m.info()["available"] is False


def test_predict_none_when_feature_missing():
    m = LSTModel({"intercept": 1.0, "weights": {"green_cover_pct": -0.2}})
    assert m.predict({"road_pressure": 0.5}) is None  # required feature absent


def test_model_endpoint_reports_trained_card(client):
    body = client.get("/model").json()
    assert body["available"] is True
    assert "green_cover_pct" in body["features"]
    assert body["metrics"]["r2_score"] > 0
    assert body["weights"]  # learned coefficients present


def test_point_includes_model_baseline(client):
    body = client.get("/point?lat=13.0417&lng=80.2341").json()
    assert isinstance(body["model_baseline_c"], (int, float))
    assert body["sources"]["model_baseline"].startswith("BigQuery ML")


def test_simulate_confidence_references_trained_model(client):
    body = client.post("/simulate", json={
        "lat": 13.0417, "lng": 80.2341,
        "interventions": [{"type": "tree", "species": "pungai", "count": 40}],
    }).json()
    lst = body["confidence_detail"]["lst_model"]
    assert lst is not None and lst["r2_score"] > 0
