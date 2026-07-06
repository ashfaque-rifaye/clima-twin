"""The grid data-access seam.

Routers read the Chennai analysis grid through a repository so the *source* of
the grid — the in-code urban-form model today, a BigQuery table populated
build-time from Earth Engine tomorrow — is swappable without touching a single
router. This is the seam that scales the base grid from Chennai → Tamil Nadu →
India → global cities (register more regions / point at a bigger table), and it
is what the deck means by "loads grid cell from BigQuery".
"""
from __future__ import annotations


class GridRepository:
    """Abstract source of grid cells. Implementations must be side-effect free
    and return the full set of cells as plain dicts matching the cell schema in
    ``app.data`` (id, name, lat, lng, feels_like_c, ...)."""

    source: str = "unknown"

    def all_cells(self) -> list[dict]:
        raise NotImplementedError
