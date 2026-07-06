"""Build-time Earth Engine export: Chennai LST / NDVI / NDBI / DEM → BigQuery.

This is the deck's "Earth Engine exports Chennai LST/NDVI/NDBI/DEM → BigQuery
(build-time)". It samples real satellite/terrain layers at the exact grid-cell
coordinates and writes `climatwin.grid_ee`, which joins 1:1 to `grid_cells` by
`id`. It is a BUILD-TIME tool — the runtime app never calls Earth Engine, so
earthengine-api stays out of the runtime image (see requirements-buildtime.txt).

Sources:
  * LST  — MODIS/061/MOD11A1 LST_Day_1km  (×0.02 K → °C)
  * NDVI — MODIS/061/MOD13Q1 NDVI          (×0.0001)
  * NDBI — Landsat 8/9 C2 L2 (SWIR-NIR normalized difference)
  * DEM  — USGS/SRTMGL1_003 elevation (m)

Usage (EE registered project + gcloud ADC):
    python backend/scripts/export_earth_engine.py --ee-project ai-pro-developer --bq-project climatwin-chennai
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND))

from app.config import settings          # noqa: E402
from app.data import _build_synthetic_grid  # noqa: E402

# Chennai dry/hot season — strongest, most decision-relevant LST signal.
START, END = "2024-03-01", "2024-06-30"

BQ_SCHEMA = [
    ("id", "STRING"), ("lat", "FLOAT"), ("lng", "FLOAT"),
    ("lst_c", "FLOAT"), ("ndvi", "FLOAT"), ("ndbi", "FLOAT"), ("elevation_m", "FLOAT"),
]


def _sample_earth_engine(ee_project: str) -> list[dict]:
    import ee
    ee.Initialize(project=ee_project)

    region = ee.Geometry.Rectangle([80.15, 12.84, 80.34, 13.24])

    lst = (ee.ImageCollection("MODIS/061/MOD11A1").filterDate(START, END)
           .select("LST_Day_1km").mean().multiply(0.02).subtract(273.15).rename("lst_c"))
    ndvi = (ee.ImageCollection("MODIS/061/MOD13Q1").filterDate(START, END)
            .select("NDVI").mean().multiply(0.0001).rename("ndvi"))
    l8 = (ee.ImageCollection("LANDSAT/LC08/C02/T1_L2").filterDate(START, END)
          .filterBounds(region).median())
    ndbi = l8.normalizedDifference(["SR_B6", "SR_B5"]).rename("ndbi")  # (SWIR-NIR)/(SWIR+NIR)
    dem = ee.Image("USGS/SRTMGL1_003").rename("elevation_m")
    stack = lst.addBands(ndvi).addBands(ndbi).addBands(dem)

    grid = _build_synthetic_grid()
    points = ee.FeatureCollection([
        ee.Feature(ee.Geometry.Point([c["lng"], c["lat"]]),
                   {"id": c["id"], "lat": c["lat"], "lng": c["lng"]})
        for c in grid
    ])
    sampled = stack.reduceRegions(collection=points, reducer=ee.Reducer.mean(),
                                  scale=1000, tileScale=4).getInfo()

    rows: list[dict] = []
    for feat in sampled["features"]:
        p = feat["properties"]
        rows.append({
            "id": p.get("id"), "lat": p.get("lat"), "lng": p.get("lng"),
            "lst_c": p.get("lst_c"), "ndvi": p.get("ndvi"),
            "ndbi": p.get("ndbi"), "elevation_m": p.get("elevation_m"),
        })
    return rows


def _write_bigquery(rows: list[dict], project: str, dataset: str, table: str, location: str) -> int:
    from google.cloud import bigquery
    client = bigquery.Client(project=project)
    ds = bigquery.Dataset(bigquery.DatasetReference(client.project, dataset))
    ds.location = location
    client.create_dataset(ds, exists_ok=True)
    ref = bigquery.DatasetReference(client.project, dataset).table(table)
    schema = [bigquery.SchemaField(n, t) for n, t in BQ_SCHEMA]
    job = client.load_table_from_json(
        rows, ref,
        job_config=bigquery.LoadJobConfig(
            schema=schema, write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE),
    )
    job.result()
    return client.get_table(ref).num_rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ee-project", default="ai-pro-developer")
    ap.add_argument("--bq-project", default=settings.gcp_project or "climatwin-chennai")
    ap.add_argument("--dataset", default=settings.bq_dataset)
    ap.add_argument("--table", default="grid_ee")
    ap.add_argument("--location", default=settings.bq_location)
    args = ap.parse_args()

    print(f"sampling Earth Engine ({args.ee_project}) {START}..{END} ...")
    rows = _sample_earth_engine(args.ee_project)
    got = sum(1 for r in rows if r.get("lst_c") is not None)
    print(f"sampled {len(rows)} points ({got} with LST)")

    n = _write_bigquery(rows, args.bq_project, args.dataset, args.table, args.location)
    print(f"wrote {n} rows to {args.bq_project}.{args.dataset}.{args.table}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
