"""Grid repository factory — selects the grid source per settings, always with
a safe fallback so the application starts even when the cloud is unreachable."""
from __future__ import annotations

import logging

from ..config import settings
from .bigquery_repo import BigQueryGridRepository
from .ee_enriched import EEEnrichedGridRepository
from .grid_repository import GridRepository
from .synthetic import SyntheticGridRepository

log = logging.getLogger("climatwin.data_access")

__all__ = [
    "GridRepository", "SyntheticGridRepository", "BigQueryGridRepository",
    "EEEnrichedGridRepository", "build_grid_repository",
]


def _resolve_project() -> str | None:
    if settings.gcp_project:
        return settings.gcp_project
    try:
        import google.auth
        _, project = google.auth.default()
        return project
    except Exception:
        return None


def build_grid_repository() -> GridRepository:
    """Pick the grid source. ``auto`` prefers BigQuery but degrades silently to
    the synthetic grid; ``bigquery`` logs loudly on failure but still degrades
    (the app must always start); ``synthetic`` never touches the cloud."""
    mode = (settings.grid_source or "auto").strip().lower()

    if mode != "synthetic":
        project = _resolve_project()
        if project:
            if mode == "ee_enriched":
                repo: GridRepository = EEEnrichedGridRepository(
                    project, settings.bq_dataset, settings.bq_grid_table, settings.bq_ee_table)
            else:
                repo = BigQueryGridRepository(project, settings.bq_dataset, settings.bq_grid_table)
            try:
                cells = repo.all_cells()  # probe + warm the instance cache
                if cells:
                    return repo
                log.warning("grid source %s returned no cells — using synthetic grid", repo.source)
            except Exception as exc:
                emit = log.error if mode in ("bigquery", "ee_enriched") else log.info
                emit("grid source '%s' unavailable (%s: %s) — using synthetic grid",
                     mode, type(exc).__name__, exc)
        elif mode in ("bigquery", "ee_enriched"):
            log.error("grid_source=%s but no GCP project could be resolved — using synthetic grid", mode)

    return SyntheticGridRepository()
