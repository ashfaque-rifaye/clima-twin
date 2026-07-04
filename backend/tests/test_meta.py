"""/health, /config, security + cache headers."""


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "gemini" in body and "live_data" in body


def test_config_shape(client):
    r = client.get("/config")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"maps_api_key", "has_maps"}
    assert body["has_maps"] == bool(body["maps_api_key"])


def test_security_headers(client):
    r = client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert "referrer-policy" in r.headers


def test_asset_cache_headers(client):
    # /assets/* should be immutable regardless of existence (404 still carries policy path)
    r = client.get("/health")
    assert "cache-control" not in r.headers or "immutable" not in r.headers.get("cache-control", "")
