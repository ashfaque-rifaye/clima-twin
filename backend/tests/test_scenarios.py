"""Scenario persistence: save → retrieve round-trip, 404, validation.
(Uses the in-memory store via the conftest swap — no live Firestore.)"""

_SCENARIO = {
    "name": "A: shade + canopy",
    "area_name": "T. Nagar",
    "interventions": [{"type": "tree", "species": "pungai", "count": 80}],
    "effect": {"delta_feels_like_c": 4.2, "people_helped": 2100},
    "note": "high-footfall bus corridor",
}


def test_save_returns_id_and_share_path(client):
    r = client.post("/scenarios", json=_SCENARIO).json()
    assert r["id"] and len(r["id"]) >= 8
    assert r["share_path"] == f"/scenarios/{r['id']}"
    assert r["backend"] == "in-memory"


def test_save_then_get_roundtrip(client):
    sid = client.post("/scenarios", json=_SCENARIO).json()["id"]
    got = client.get(f"/scenarios/{sid}").json()
    assert got["name"] == "A: shade + canopy"
    assert got["area_name"] == "T. Nagar"
    assert got["effect"]["delta_feels_like_c"] == 4.2
    assert got["id"] == sid and got["created_at"]


def test_get_missing_is_404(client):
    assert client.get("/scenarios/doesnotexist").status_code == 404


def test_save_validates_name(client):
    assert client.post("/scenarios", json={"name": ""}).status_code == 422
