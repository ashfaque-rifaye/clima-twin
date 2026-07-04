"""Input validation: every endpoint rejects out-of-range/oversized input with 422."""
import pytest


@pytest.mark.parametrize("path", [
    "/point?lat=999&lng=80.2",
    "/point?lat=13.0&lng=999",
    "/point?lat=abc&lng=80.2",
    "/microclimate?lat=91&lng=80.2",
    "/hotspots?hazard=lava",
    "/hotspots?hazard=heat&limit=0",
    "/hotspots?hazard=heat&limit=999",
    "/grid?hazard=magma",
    "/grid?hazard=heat&n=1",
    "/grid?hazard=heat&n=99",
])
def test_get_validation(client, path):
    assert client.get(path).status_code == 422


def test_simulate_bounds(client):
    bad = [
        {"lat": 999, "lng": 80.2, "interventions": []},
        {"lat": 13.0, "lng": 80.2, "interventions": [{"type": "tree", "count": 99_999_999}]},
        {"lat": 13.0, "lng": 80.2, "interventions": [{"type": "tree", "count": -5}]},
        {"lat": 13.0, "lng": 80.2, "interventions": [{"type": "t" * 50, "count": 1}]},
        {"lat": 13.0, "lng": 80.2, "interventions": [{"type": "tree", "count": 1}] * 30},
        {"lat": 13.0, "lng": 80.2, "budget_inr": -1},
    ]
    for body in bad:
        assert client.post("/simulate", json=body).status_code == 422, body


def test_ask_length_caps(client):
    assert client.post("/ask", json={"question": ""}).status_code == 422
    assert client.post("/ask", json={"question": "x" * 501}).status_code == 422
    assert client.post("/ask", json={"question": "hottest area?"}).status_code == 200


def test_proposal_caps(client):
    assert client.post("/proposal", json={"area_name": "", "plan": {}}).status_code == 422
    huge = {"area_name": "T. Nagar", "plan": {"blob": "x" * 30_000}}
    assert client.post("/proposal", json=huge).status_code == 422


def test_recommend_bounds(client):
    assert client.post("/recommend", json={"lat": -95, "lng": 80.2}).status_code == 422
    assert client.post("/recommend", json={"lat": 13.0, "lng": 80.2, "goal": "g" * 400}).status_code == 422
