"""EE grid-enrichment reconciliation: real satellite where present, synthetic
in the gaps, coherent derived fields."""
from app.data_access.ee_enriched import enrich_cell

_CELL = {
    "id": "c10_10", "surface_temp_c": 40.0, "feels_like_c": 43.0,
    "ndvi": 0.15, "green_cover_pct": 10.0, "elevation_m": 12.0,
    "flood_score": 0.40, "flood_risk": "medium",
}


def test_gap_cell_is_unchanged():
    # No EE row, or LST null → keep synthetic (hybrid gap-fill).
    assert enrich_cell(_CELL, None) == _CELL
    assert enrich_cell(_CELL, {"lst_c": None, "ndvi": 0.5}) == _CELL


def test_lst_shifts_surface_and_feels_like_by_same_delta():
    out = enrich_cell(_CELL, {"lst_c": 37.0, "ndvi": None, "elevation_m": None})
    assert out["surface_temp_c"] == 37.0
    # feels-like shifts by (37 - 40) = -3, preserving the humidity/coast offset
    assert out["feels_like_c"] == 40.0
    assert out["ee_enriched"] is True


def test_ndvi_drives_green_cover():
    out = enrich_cell(_CELL, {"lst_c": 40.0, "ndvi": 0.5, "elevation_m": None})
    assert out["ndvi"] == 0.5
    assert out["green_cover_pct"] == 35.0  # 0.5 * 70


def test_lower_real_elevation_raises_flood():
    out = enrich_cell(_CELL, {"lst_c": 40.0, "ndvi": None, "elevation_m": 2.0})
    assert out["elevation_m"] == 2.0
    assert out["flood_score"] > _CELL["flood_score"]  # lower ground → more flood
    assert out["flood_risk"] in ("medium", "high")


def test_negative_ee_ndvi_clamped():
    out = enrich_cell(_CELL, {"lst_c": 40.0, "ndvi": -0.2, "elevation_m": None})
    assert out["ndvi"] == 0.0
    assert out["green_cover_pct"] == 3.0  # clamped floor
