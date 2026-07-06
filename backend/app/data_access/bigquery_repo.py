"""BigQuery-backed grid source.

Reads the precomputed analysis grid from a BigQuery table once, into memory, at
startup. The grid is small (~900 rows for Chennai) and immutable between builds,
so serving it in-process keeps per-request latency ~0 and cost ~0 — exactly the
deck's "instant reads; precomputed BigQuery grid; live calls only for the
selected point." The result is cached on the instance so the factory's
existence probe and the startup load don't double-query.
"""
from __future__ import annotations

import logging

from .grid_repository import GridRepository

log = logging.getLogger("climatwin.data_access")


class BigQueryGridRepository(GridRepository):
    def __init__(self, project: str, dataset: str, table: str):
        self.project = project
        self.dataset = dataset
        self.table = table
        self.source = f"bigquery:{project}.{dataset}.{table}"
        self._cells: list[dict] | None = None

    def all_cells(self) -> list[dict]:
        if self._cells is not None:
            return self._cells
        from google.cloud import bigquery

        client = bigquery.Client(project=self.project)
        # ORDER BY id → deterministic ordering across reads (parity with the
        # synthetic builder's row order).
        sql = f"SELECT * FROM `{self.project}.{self.dataset}.{self.table}` ORDER BY id"
        rows = client.query(sql).result()
        self._cells = [dict(row) for row in rows]
        log.info("loaded %d grid cells from %s", len(self._cells), self.source)
        return self._cells
