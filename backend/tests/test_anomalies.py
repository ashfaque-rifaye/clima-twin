"""/anomalies surfaces local spatial outliers, ranked, with explanations."""


def test_heat_anomalies_ranked_with_reasons(client):
    body = client.get("/anomalies?hazard=heat&limit=6").json()
    assert body["hazard"] == "heat"
    assert body["metric"] == "feels_like_c"
    a = body["anomalies"]
    assert len(a) <= 6
    # ranked by score descending
    assert [x["score"] for x in a] == sorted((x["score"] for x in a), reverse=True)
    for x in a:
        assert x["score"] >= 1.0
        assert x["value"] > x["neighbourhood_mean"]  # heat anomaly = hotter than neighbours
        assert x["why"]


def test_green_anomaly_is_below_neighbourhood(client):
    body = client.get("/anomalies?hazard=green&limit=5").json()
    for x in body["anomalies"]:
        assert x["value"] < x["neighbourhood_mean"]  # canopy gap = below neighbours
        assert "gap" in x["why"] or "below" in x["why"]


def test_limit_is_respected(client):
    body = client.get("/anomalies?hazard=air&limit=3").json()
    assert len(body["anomalies"]) <= 3
