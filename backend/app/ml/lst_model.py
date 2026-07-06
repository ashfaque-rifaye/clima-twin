"""In-process serving for the trained land-surface-temperature (LST) model.

The model is trained build-time in BigQuery ML (LINEAR_REG) and its learned
weights + metrics are exported to ``lst_model.json`` (committed to the repo).
At runtime we serve predictions in-process from those weights: a linear model
is a few multiply-adds, so this is ~0 latency and $0 per request, and the
coefficients themselves are the explanation (Responsible/explainable AI).

If the card is missing or malformed the model reports ``available = False`` and
callers fall back to the coefficient engine — the app always works.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

log = logging.getLogger("climatwin.ml")

_CARD_PATH = Path(__file__).parent / "lst_model.json"


class LSTModel:
    def __init__(self, card: dict | None):
        self.card = card or {}
        self._intercept = float(self.card.get("intercept", 0.0))
        self._weights: dict[str, float] = {
            k: float(v) for k, v in (self.card.get("weights") or {}).items()
        }
        self.features = list(self._weights.keys())
        self.available = bool(self._weights)

    def predict(self, cell: dict) -> float | None:
        """Predicted feels-like °C from a cell's urban-form features, or None if
        the model is unavailable or a required feature is missing."""
        if not self.available:
            return None
        y = self._intercept
        for feat, weight in self._weights.items():
            value = cell.get(feat)
            if value is None:
                return None
            y += weight * float(value)
        return round(y, 1)

    def info(self) -> dict:
        """Public model card for the /model endpoint."""
        if not self.available:
            return {"available": False, "note": "LST model not trained yet — using coefficient engine."}
        return {"available": True, **self.card}


def _load() -> LSTModel:
    try:
        if _CARD_PATH.exists():
            return LSTModel(json.loads(_CARD_PATH.read_text(encoding="utf-8")))
    except Exception:
        log.exception("failed to load LST model card — serving without it")
    return LSTModel(None)


MODEL = _load()


def reload_model() -> LSTModel:
    """Re-read the card from disk (used after (re)training)."""
    global MODEL
    MODEL = _load()
    return MODEL
