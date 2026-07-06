"""Every response carries a correlation id; inbound ids are propagated."""


def test_response_has_request_id(client):
    r = client.get("/health")
    assert r.headers.get("X-Request-Id")
    assert len(r.headers["X-Request-Id"]) >= 8


def test_inbound_request_id_is_propagated(client):
    r = client.get("/health", headers={"X-Request-Id": "trace-abc-123"})
    assert r.headers["X-Request-Id"] == "trace-abc-123"


def test_ids_are_unique_per_request(client):
    a = client.get("/health").headers["X-Request-Id"]
    b = client.get("/health").headers["X-Request-Id"]
    assert a != b
