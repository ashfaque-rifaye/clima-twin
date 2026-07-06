"""Earth-Engine-enriched grid source (hybrid).

Reads the base grid (`grid_cells`) and the Earth Engine export (`grid_ee`) from
BigQuery and joins them by `id`, replacing modeled fields with real satellite /
terrain measurements WHERE THEY EXIST and keeping synthetic values in the gaps
(MODIS LST is 1 km and null over water/coast). This is the opt-in "real
satellite" mode — the deck's full "Earth Engine → BigQuery → grid" chain — kept
separate from the default so the tuned demo is never destabilized silently.

Reconciliation (only applied where `lst_c` is present):
  * surface_temp_c ← real LST (°C)
  * feels_like_c   ← shifted by (LST − synthetic surface temp), preserving the
                     humidity/coast offset baked into the synthetic feels-like
  * ndvi / green_cover_pct ← from real NDVI
  * elevation_m + flood_score/flood_risk ← adjusted for real SRTM elevation
  * air_quality_index stays modeled (Earth Engine does not provide AQI) — labelled.
"""
from __future__ import annotations

import logging

from .bigquery_repo import BigQueryGridRepository
from .grid_repository import GridRepository

log = logging.getLogger("climatwin.data_access")


def _clamp(v: float, lo: float, hi: float) -> float:
    return lo if v < lo else hi if v > hi else v


def enrich_cell(cell: dict, ee: dict | None) -> dict:
    """Return a copy of `cell` enriched with EE data, or the cell unchanged when
    EE has no usable LST at that location (hybrid gap-fill)."""
    if not ee or ee.get("lst_c") is None:
        return cell
    c = dict(cell)
    lst = float(ee["lst_c"])

    syn_surface = c.get("surface_temp_c")
    if syn_surface is not None and c.get("feels_like_c") is not None:
        c["feels_like_c"] = round(float(c["feels_like_c"]) + (lst - float(syn_surface)), 1)
    c["surface_temp_c"] = round(lst, 1)

    ndvi = ee.get("ndvi")
    if ndvi is not None:
        ndvi_c = _clamp(float(ndvi), 0.0, 0.8)
        c["ndvi"] = round(ndvi_c, 2)
        c["green_cover_pct"] = round(_clamp(ndvi_c * 70.0, 3.0, 60.0), 1)

    elev = ee.get("elevation_m")
    if elev is not None and c.get("elevation_m") is not None and c.get("flood_score") is not None:
        # synthetic flood term is 0.34*(1 - elev/28): lower real elevation → more flood
        d_flood = 0.34 * ((float(c["elevation_m"]) - float(elev)) / 28.0)
        c["elevation_m"] = round(float(elev), 1)
        fs = _clamp(float(c["flood_score"]) + d_flood, 0.02, 1.0)
        c["flood_score"] = round(fs, 3)
        c["flood_risk"] = "high" if fs >= 0.66 else "medium" if fs >= 0.40 else "low"

    c["ee_enriched"] = True
    return c


class EEEnrichedGridRepository(GridRepository):
    def __init__(self, project: str, dataset: str, grid_table: str, ee_table: str):
        self.project = project
        self.dataset = dataset
        self.grid_table = grid_table
        self.ee_table = ee_table
        self.source = f"bigquery+ee:{project}.{dataset}.{grid_table}+{ee_table}"
        self._cells: list[dict] | None = None

    def all_cells(self) -> list[dict]:
        if self._cells is not None:
            return self._cells
        from google.cloud import bigquery

        base = BigQueryGridRepository(self.project, self.dataset, self.grid_table).all_cells()
        client = bigquery.Client(project=self.project)
        ee_rows = client.query(
            f"SELECT id, lst_c, ndvi, elevation_m FROM "
            f"`{self.project}.{self.dataset}.{self.ee_table}`"
        ).result()
        ee_by_id = {r["id"]: dict(r) for r in ee_rows}

        cells = [enrich_cell(c, ee_by_id.get(c["id"])) for c in base]
        enriched = sum(1 for c in cells if c.get("ee_enriched"))
        log.info("EE-enriched grid: %d/%d cells from real satellite data (%s)",
                 enriched, len(cells), self.source)
        self._cells = cells
        return cells
