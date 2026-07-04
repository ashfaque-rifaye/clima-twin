"""Multi-resolution tile engine: band routing, spatial slicing, caching."""
import math

from app.routers.tiles import band_for_zoom, tile_bounds


def _tile_for(lat: float, lng: float, z: int) -> tuple[int, int]:
    n = 2 ** z
    x = int((lng + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def _get(client, hz, z, lat, lng):
    x, y = _tile_for(lat, lng, z)
    r = client.get(f"/tiles/{hz}/{z}/{x}/{y}")
    assert r.status_code == 200
    return r.json()


def test_band_mapping():
    assert band_for_zoom(4) == "country"
    assert band_for_zoom(6) == "country"
    assert band_for_zoom(7) == "state"
    assert band_for_zoom(10) == "city"
    assert band_for_zoom(13) == "block"
    assert band_for_zoom(16) == "street"
    assert band_for_zoom(20) == "street"


def test_tile_bounds_roundtrip():
    w, s, e, n = tile_bounds(11, *_tile_for(13.06, 80.24, 11))
    assert w <= 80.24 <= e
    assert s <= 13.06 <= n
    assert (e - w) > 0 and (n - s) > 0


def test_country_band_serves_summaries_not_hotcells(client):
    d = _get(client, "heat", 5, 20.0, 78.0)
    assert d["band"] == "country"
    assert d["summaries"], "state summaries expected over India"
    assert d["cells"] == []          # never raw analysis cells at country scale
    assert d["assets"] == []


def test_state_band_serves_districts_and_rivers(client):
    d = _get(client, "flood", 8, 11.0, 78.5)
    assert d["band"] == "state"
    assert d["summaries"], "TN districts expected"
    names = [r["name"] for r in d["rivers"]]
    assert "Kaveri" in names


def test_city_band_serves_calibrated_cells(client):
    d = _get(client, "heat", 11, 13.06, 80.24)
    assert d["band"] == "city"
    assert len(d["cells"]) > 50
    assert d["extent"] is not None
    assert all(0.0 <= c["weight"] <= 1.0 for c in d["cells"])


def test_city_tiles_include_margin_for_seamless_interp(client):
    # a cell just outside the tile bbox must appear (1-lattice-step margin)
    d = _get(client, "heat", 12, 13.06, 80.24)
    w, s, e, n = d["bounds"]
    outside = [c for c in d["cells"] if not (s <= c["lat"] <= n and w <= c["lng"] <= e)]
    assert outside, "expected margin cells beyond the tile bounds"


def test_block_band_downscales_and_serves_assets(client):
    d = _get(client, "heat", 14, 13.0629, 80.2343)  # around Loyola College
    assert d["band"] == "block"
    assert len(d["cells"]) > 100
    assert any(a["name"] == "Loyola College" for a in d["assets"])


def test_block_downscale_is_deterministic(client):
    a = _get(client, "heat", 14, 13.0629, 80.2343)
    b = _get(client, "heat", 14, 13.0629, 80.2343)
    assert a["cells"] == b["cells"]


def test_far_away_tile_is_lightweight(client):
    d = _get(client, "heat", 11, 13.0, 85.0)  # Bay of Bengal, far east
    assert d["cells"] == []
    assert d["summaries"] == []


def test_out_of_range_tile_indices(client):
    r = client.get("/tiles/heat/3/999/999")
    assert r.status_code == 200
    assert r.json()["source"] == "empty"
    assert client.get("/tiles/lava/5/10/10").status_code == 422
