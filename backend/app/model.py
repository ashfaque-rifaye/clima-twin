"""Shared cooling-effect computation (used by /simulate and /recommend).

Transparent + labeled illustrative. Day 3: swap the temperature delta for a
BigQuery ML / scikit-learn LST model trained on the real Chennai grid.
"""
from .data import SPECIES_BY_KEY
from .ml import MODEL as _LST

_CANOPY_M2 = {"very_high": 80, "high": 55, "medium": 35, "low": 20}
DELTA_CEILING_C = 6.0

# Relative uncertainty carried on the headline estimates. Canopy/surface cooling
# coefficients in the literature span a wide range, so we report a conservative
# band rather than false-precision point estimates. These bands are what the
# deck refers to as "confidence bands on every number" (S2/S3/S5).
_DELTA_REL_UNCERTAINTY = 0.35
_PEOPLE_REL_UNCERTAINTY = 0.25


def _band(expected: float, rel: float, ndigits: int = 1) -> dict:
    """A symmetric uncertainty band around a point estimate."""
    lo = round(max(0.0, expected * (1 - rel)), ndigits)
    hi = round(expected * (1 + rel), ndigits)
    return {
        "expected": round(expected, ndigits),
        "low": lo,
        "high": hi,
        "rel_uncertainty": rel,
    }


def compute_effect(cell: dict, interventions: list[dict]) -> dict:
    delta = cost = area = 0.0
    risks: list[str] = []
    improves_air = reduces_flood = False
    citations: list[dict] = []
    _cited: set[str] = set()

    for iv in interventions:
        spec = SPECIES_BY_KEY.get(iv.get("species") or iv.get("type"))
        if not spec:
            continue
        count = max(int(iv.get("count", 0)), 0)
        per = spec.get("cooling_c_per_tree") or spec.get("cooling_c_per_unit") or 0.0
        delta += per * count
        cost += spec.get("cost_inr_per_unit", 0) * count

        # Aggregate the literature citation for every coefficient actually used.
        if count > 0 and spec["key"] not in _cited and spec.get("source_ref"):
            citations.append({
                "factor": spec["name"],
                "coefficient_c_per_unit": per,
                "source": spec["source_ref"],
            })
            _cited.add(spec["key"])

        if spec["type"] == "tree":
            area += _CANOPY_M2.get(spec.get("shade", "medium"), 35) * count
            improves_air = True
            if not spec.get("native", False):
                risks.append(f"{spec['name']} is non-native - more maintenance/water.")
            if spec.get("water_need") == "high":
                risks.append(f"{spec['name']} is thirsty - risky in Chennai summers.")
        if spec.get("flood_reduction") in ("medium", "high"):
            reduces_flood = True
        if spec["type"] == "misting":
            risks.append("Misting points consume water - meter usage in droughts.")

    delta = min(delta, DELTA_CEILING_C)
    baseline = cell["feels_like_c"]
    people = cell.get("bus_commuters_daily", 0) + int(cell.get("population", 0) * 0.05)

    return {
        "baseline_feels_like_c": baseline,
        "projected_feels_like_c": round(baseline - delta, 1),
        "delta_feels_like_c": round(delta, 1),
        "cooled_area_m2": round(area, 0),
        "people_helped": people,
        "cost_inr": round(cost, 0),
        "air_quality_change": (
            f"~{min(8, max(2, int(delta * 2)))} AQI points lower (canopy traps PM2.5)"
            if improves_air else None
        ),
        "flood_change": "monsoon waterlogging reduced (more permeable surface)" if reduces_flood else None,
        "what_could_go_wrong": risks,
        # Explainability: uncertainty band on every headline number + the
        # literature sources behind each coefficient used (deck S2/S3/S5).
        "confidence": {
            "level": "illustrative",
            "method": "literature-informed coefficient model (heuristic, not measured)",
            "delta_feels_like_c": _band(delta, _DELTA_REL_UNCERTAINTY, ndigits=1),
            "people_helped": _band(people, _PEOPLE_REL_UNCERTAINTY, ndigits=0),
            # Provenance: the trained BigQuery ML LST model that backs the
            # baseline/urban-form analysis (None when the card isn't present).
            "lst_model": ({
                "source": _LST.card.get("source"),
                "type": _LST.card.get("type"),
                "r2_score": (_LST.card.get("metrics") or {}).get("r2_score"),
            } if _LST.available else None),
        },
        "citations": citations,
    }
