"""Synthetic (in-code) grid source — the deterministic Chennai urban-form grid.

This is the always-available, $0, no-network default and the fallback whenever
BigQuery is not configured or unreachable. It is also the seed the loader pushes
into BigQuery until the Earth Engine export replaces it.
"""
from __future__ import annotations

from .grid_repository import GridRepository


class SyntheticGridRepository(GridRepository):
    source = "synthetic-urban-form-v1"

    def all_cells(self) -> list[dict]:
        # Imported lazily to avoid any import cycle with app.data.
        from ..data import _build_synthetic_grid
        return _build_synthetic_grid()
