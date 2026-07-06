"""Build-time loader: push the Chennai analysis grid into BigQuery.

This is the seed for the deck's "Earth Engine → BigQuery (build-time)" pipeline.
Until the Earth Engine export (see scripts/export_earth_engine.py) is run, the
grid is seeded from the deterministic urban-form model in app.data. The runtime
then reads this table via BigQueryGridRepository.

Usage (from repo root or backend/, with gcloud ADC configured):
    python backend/scripts/load_grid_to_bigquery.py
    python backend/scripts/load_grid_to_bigquery.py --project climatwin-chennai --dataset climatwin

Idempotent: re-running truncates and reloads the table.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Make ``app`` importable whether run from repo root or backend/.
_BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND))

from app.config import settings  # noqa: E402
from app.data import _build_synthetic_grid  # noqa: E402

# Explicit schema keeps column types stable regardless of loader/env.
SCHEMA_FIELDS = [
    ("id", "STRING"), ("name", "STRING"), ("lat", "FLOAT"), ("lng", "FLOAT"),
    ("surface_temp_c", "FLOAT"), ("feels_like_c", "FLOAT"), ("ndvi", "FLOAT"),
    ("green_cover_pct", "FLOAT"), ("air_quality_index", "INTEGER"),
    ("dominant_pollutant", "STRING"), ("flood_risk", "STRING"),
    ("flood_score", "FLOAT"), ("elevation_m", "FLOAT"), ("population", "INTEGER"),
    ("bus_commuters_daily", "INTEGER"), ("elderly_pct", "FLOAT"),
    ("data_density", "STRING"), ("road_pressure", "FLOAT"),
    ("waterway_proximity", "FLOAT"),
]


def main() -> int:
    from google.cloud import bigquery

    ap = argparse.ArgumentParser(description="Load the Chennai grid into BigQuery.")
    ap.add_argument("--project", default=settings.gcp_project or None)
    ap.add_argument("--dataset", default=settings.bq_dataset)
    ap.add_argument("--table", default=settings.bq_grid_table)
    ap.add_argument("--location", default=settings.bq_location)
    args = ap.parse_args()

    client = bigquery.Client(project=args.project)
    project = client.project
    dataset_ref = bigquery.DatasetReference(project, args.dataset)
    table_ref = dataset_ref.table(args.table)

    # 1) dataset (co-located with Cloud Run region)
    ds = bigquery.Dataset(dataset_ref)
    ds.location = args.location
    client.create_dataset(ds, exists_ok=True)
    print(f"dataset ready: {project}.{args.dataset} ({args.location})")

    # 2) load rows, truncating any previous build
    grid = _build_synthetic_grid()
    schema = [bigquery.SchemaField(n, t) for n, t in SCHEMA_FIELDS]
    job_config = bigquery.LoadJobConfig(
        schema=schema,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )
    job = client.load_table_from_json(grid, table_ref, job_config=job_config)
    job.result()  # wait

    table = client.get_table(table_ref)
    print(f"loaded {table.num_rows} rows into {project}.{args.dataset}.{args.table}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
