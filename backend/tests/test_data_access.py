"""Grid repository seam: synthetic source shape, factory selection, and the
safety-critical fallback to synthetic when BigQuery is unreachable."""
import app.data_access as da
from app.config import settings
from app.data_access import bigquery_repo
from app.data_access.synthetic import SyntheticGridRepository

_REQUIRED = ("id", "name", "lat", "lng", "feels_like_c", "air_quality_index",
             "flood_risk", "green_cover_pct", "bus_commuters_daily")


def test_synthetic_repo_shape():
    cells = SyntheticGridRepository().all_cells()
    assert len(cells) == 900
    for key in _REQUIRED:
        assert key in cells[0]


def test_factory_synthetic_mode(monkeypatch):
    monkeypatch.setattr(settings, "grid_source", "synthetic")
    repo = da.build_grid_repository()
    assert isinstance(repo, SyntheticGridRepository)
    assert repo.source == "synthetic-urban-form-v1"


def test_factory_falls_back_when_bigquery_fails(monkeypatch):
    monkeypatch.setattr(settings, "grid_source", "bigquery")
    monkeypatch.setattr(settings, "gcp_project", "no-such-project-xyz")

    def boom(self):
        raise RuntimeError("bigquery unreachable")

    monkeypatch.setattr(bigquery_repo.BigQueryGridRepository, "all_cells", boom)
    repo = da.build_grid_repository()
    assert repo.source == "synthetic-urban-form-v1"  # degraded safely, app still starts
