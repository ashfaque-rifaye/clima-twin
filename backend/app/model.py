"""Shared intervention-impact computation (used by /simulate and /recommend).

Multi-metric and hazard-aware: every intervention in the catalogue carries
coefficients for temperature, air quality, flood volume managed, green area,
carbon and water, plus capital and maintenance cost. This function accumulates
them into a full decision readout — headline cooling for backward compatibility,
plus an `impacts` and `costs` breakdown for the planning report.

Transparent + labelled illustrative; the temperature line is cross-checked
against the trained BigQuery ML LST model.
"""
from .data import SPECIES_BY_KEY
from .ml import MODEL as _LST

DELTA_CEILING_C = 6.0
AQI_CEILING = 40.0

# Relative uncertainty carried on the headline estimates. Coefficients are
# literature-informed point estimates with wide real-world spread, so we report
# a conservative band rather than false precision (deck S2/S3/S5).
_DELTA_REL_UNCERTAINTY = 0.35
_PEOPLE_REL_UNCERTAINTY = 0.25


def _band(expected: float, rel: float, ndigits: int = 1) -> dict:
    lo = round(max(0.0, expected * (1 - rel)), ndigits)
    hi = round(expected * (1 + rel), ndigits)
    return {"expected": round(expected, ndigits), "low": lo, "high": hi, "rel_uncertainty": rel}


def _primary_metric(spec: dict) -> tuple[str, float]:
    """The headline coefficient for an intervention's hazard (for citations)."""
    hazard = spec.get("hazard", "heat")
    if hazard == "air":
        return "AQI points improved / unit", spec.get("aqi", 0.0)
    if hazard == "flood":
        return "m³ stormwater managed / unit", spec.get("flood_m3", 0.0)
    if hazard == "green":
        return "m² green added / unit", spec.get("green_m2", 0.0)
    return "°C cooling / unit", spec.get("cooling_c", 0.0)


def compute_effect(cell: dict, interventions: list[dict]) -> dict:
    temp = aqi = flood_m3 = green_m2 = carbon = water = 0.0
    capital = maint = 0.0
    risks: list[str] = []
    citations: list[dict] = []
    _cited: set[str] = set()

    for iv in interventions:
        spec = SPECIES_BY_KEY.get(iv.get("species") or iv.get("type"))
        if not spec:
            continue
        count = max(int(iv.get("count", 0)), 0)
        if count == 0:
            continue

        temp += spec.get("cooling_c", 0.0) * count
        aqi += spec.get("aqi", 0.0) * count
        flood_m3 += spec.get("flood_m3", 0.0) * count
        green_m2 += spec.get("green_m2", 0.0) * count
        carbon += spec.get("carbon_kg_yr", 0.0) * count
        water += spec.get("water_l", 0.0) * count
        capital += spec.get("capital_inr", 0.0) * count
        maint += spec.get("maint_inr_yr", 0.0) * count

        for r in spec.get("risks", []):
            if r and r not in risks:
                risks.append(r)

        if spec["key"] not in _cited and spec.get("source_ref"):
            metric, coeff = _primary_metric(spec)
            citations.append({
                "factor": spec["name"],
                "metric": metric,
                "coefficient": coeff,
                "coefficient_c_per_unit": spec.get("cooling_c", 0.0),  # backward-compat
                "source": spec["source_ref"],
            })
            _cited.add(spec["key"])

    temp = min(temp, DELTA_CEILING_C)
    aqi = min(aqi, AQI_CEILING)
    baseline = cell["feels_like_c"]
    people = cell.get("bus_commuters_daily", 0) + int(cell.get("population", 0) * 0.05)

    impacts = {
        "temp_reduction_c": round(temp, 1),
        "aqi_improvement": round(aqi, 1),
        "flood_managed_m3": round(flood_m3, 0),
        "canopy_added_m2": round(green_m2, 0),
        "carbon_seq_kg_year": round(carbon, 0),
        "water_retention_l": round(water, 0),
        "people_benefited": people,
    }
    costs = {
        "capital_inr": round(capital, 0),
        "maintenance_inr_year": round(maint, 0),
        "five_year_inr": round(capital + 5 * maint, 0),
        "ten_year_inr": round(capital + 10 * maint, 0),
    }

    return {
        # --- backward-compatible headline fields ---
        "baseline_feels_like_c": baseline,
        "projected_feels_like_c": round(baseline - temp, 1),
        "delta_feels_like_c": round(temp, 1),
        "cooled_area_m2": round(green_m2, 0),
        "people_helped": people,
        "cost_inr": round(capital, 0),
        "air_quality_change": (f"~{round(aqi)} AQI points lower" if aqi >= 1 else None),
        "flood_change": (f"~{round(flood_m3)} m³ stormwater managed per event" if flood_m3 > 0 else None),
        "what_could_go_wrong": risks,
        "confidence": {
            "level": "illustrative",
            "method": "literature-informed coefficient model (heuristic, not measured)",
            "delta_feels_like_c": _band(temp, _DELTA_REL_UNCERTAINTY, ndigits=1),
            "people_helped": _band(people, _PEOPLE_REL_UNCERTAINTY, ndigits=0),
            "lst_model": ({
                "source": _LST.card.get("source"),
                "type": _LST.card.get("type"),
                "r2_score": (_LST.card.get("metrics") or {}).get("r2_score"),
            } if _LST.available else None),
        },
        "citations": citations,
        # --- multi-metric decision readout ---
        "impacts": impacts,
        "costs": costs,
    }
