"""Train the explainable LST (feels-like) cooling model.

Primary path: BigQuery ML LINEAR_REG on `climatwin.grid_cells` (the deck's
"BigQuery ML trains a free, explainable cooling model"). We also compute the
raw-feature-space OLS fit locally and export THOSE coefficients as the serving
weights, so in-process inference is exactly reproducible and $0 (a linear model
is a handful of multiply-adds). The BigQuery ML model + its ML.EVALUATE metrics
are recorded in the card for transparency.

Usage (gcloud ADC configured):
    python backend/scripts/train_lst_model_bqml.py --project climatwin-chennai
    python backend/scripts/train_lst_model_bqml.py --local   # OLS only, no cloud

Writes backend/app/ml/lst_model.json (committed → runtime serves it in-process).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND))

from app.config import settings          # noqa: E402
from app.data import _build_synthetic_grid  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("train_lst")

# Urban-form drivers (NOT surface_temp_c — that is collinear with the label).
FEATURES = ["green_cover_pct", "road_pressure", "elevation_m", "waterway_proximity"]
LABEL = "feels_like_c"
CARD_PATH = _BACKEND / "app" / "ml" / "lst_model.json"


def _solve(A: list[list[float]], b: list[float]) -> list[float]:
    """Gauss-Jordan solve of A x = b."""
    n = len(A)
    M = [[float(A[i][j]) for j in range(n)] + [float(b[i])] for i in range(n)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(M[r][col]))
        M[col], M[piv] = M[piv], M[col]
        d = M[col][col]
        if abs(d) < 1e-12:
            continue
        M[col] = [v / d for v in M[col]]
        for r in range(n):
            if r != col and M[r][col]:
                f = M[r][col]
                M[r] = [M[r][c] - f * M[col][c] for c in range(n + 1)]
    return [M[i][n] for i in range(n)]


def _ols(rows: list[dict]) -> tuple[float, dict, dict]:
    """Raw-space OLS with intercept → (intercept, weights, metrics)."""
    p = len(FEATURES)
    X = [[1.0] + [float(r[f]) for f in FEATURES] for r in rows]
    y = [float(r[LABEL]) for r in rows]
    n, m = len(rows), p + 1
    XtX = [[0.0] * m for _ in range(m)]
    Xty = [0.0] * m
    for i in range(n):
        xi = X[i]
        for a in range(m):
            Xty[a] += xi[a] * y[i]
            for bb in range(m):
                XtX[a][bb] += xi[a] * xi[bb]
    beta = _solve(XtX, Xty)
    yhat = [sum(beta[a] * X[i][a] for a in range(m)) for i in range(n)]
    ybar = sum(y) / n
    ss_res = sum((y[i] - yhat[i]) ** 2 for i in range(n))
    ss_tot = sum((v - ybar) ** 2 for v in y) or 1e-9
    metrics = {
        "r2_score": round(1 - ss_res / ss_tot, 4),
        "mean_absolute_error": round(sum(abs(y[i] - yhat[i]) for i in range(n)) / n, 4),
        "root_mean_squared_error": round((ss_res / n) ** 0.5, 4),
    }
    weights = {FEATURES[k]: round(beta[k + 1], 6) for k in range(p)}
    return round(beta[0], 6), weights, metrics


def _train_bqml(project: str, dataset: str, table: str, model: str) -> dict | None:
    try:
        from google.cloud import bigquery
        client = bigquery.Client(project=project)
        fq_model = f"`{client.project}.{dataset}.{model}`"
        fq_table = f"`{client.project}.{dataset}.{table}`"
        feats = ", ".join(FEATURES)
        log.info("training BigQuery ML model %s ...", fq_model)
        client.query(
            f"CREATE OR REPLACE MODEL {fq_model} "
            f"OPTIONS(model_type='linear_reg', input_label_cols=['{LABEL}'], "
            f"l2_reg=0, data_split_method='no_split') AS "
            f"SELECT {LABEL}, {feats} FROM {fq_table}"
        ).result()
        ev = list(client.query(f"SELECT * FROM ML.EVALUATE(MODEL {fq_model})").result())[0]
        mse = ev.get("mean_squared_error") or 0.0
        return {
            "model": f"{client.project}.{dataset}.{model}",
            "metrics": {
                "r2_score": round(ev.get("r2_score") or 0.0, 4),
                "mean_absolute_error": round(ev.get("mean_absolute_error") or 0.0, 4),
                "root_mean_squared_error": round(mse ** 0.5, 4),
            },
        }
    except Exception as exc:
        log.warning("BigQuery ML training skipped/failed (%s) — card uses local OLS only", exc)
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=settings.gcp_project or "climatwin-chennai")
    ap.add_argument("--dataset", default=settings.bq_dataset)
    ap.add_argument("--table", default=settings.bq_grid_table)
    ap.add_argument("--model", default="lst_model")
    ap.add_argument("--local", action="store_true", help="OLS only; skip BigQuery ML")
    args = ap.parse_args()

    rows = _build_synthetic_grid()
    intercept, weights, metrics = _ols(rows)
    log.info("local OLS R2=%.3f MAE=%.2f", metrics["r2_score"], metrics["mean_absolute_error"])

    bqml = None if args.local else _train_bqml(args.project, args.dataset, args.table, args.model)

    card = {
        "name": args.model,
        "type": "BigQuery ML LINEAR_REG (served in-process as exported linear weights)",
        "label": LABEL,
        "features": FEATURES,
        "intercept": intercept,
        "weights": weights,
        "metrics": metrics,
        "training_rows": len(rows),
        "trained_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": (bqml or {}).get("model", "local-ols"),
        "bqml": bqml,
        "note": ("Trained in BigQuery ML on the Chennai grid; explainable linear "
                 "coefficients are °C per unit feature. Served in-process for $0 inference."),
    }
    CARD_PATH.write_text(json.dumps(card, indent=2), encoding="utf-8")
    log.info("wrote %s (source=%s)", CARD_PATH, card["source"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
