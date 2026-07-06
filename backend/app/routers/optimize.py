"""POST /optimize — fixed-budget → optimal intervention plan (Workflow B).

Given a location, hazard and budget, the engine selects the best mix from that
hazard's library by benefit-per-rupee, diversified across the top options so it
never returns a monoculture, and fitted to the budget. It returns the costed
plan, multi-metric impact, budget accounting, ROI, and an AI-authored rationale
(structured, with a deterministic fallback) plus assumptions and confidence.
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..data import SPECIES_BY_KEY, interventions_for, nearest_cell
from ..gemini import generate_json, gemini_available
from ..model import _primary_metric, compute_effect

router = APIRouter(tags=["optimize"])

# which impact field is the "primary" per hazard
_IMPACT_KEY = {
    "heat": "temp_reduction_c",
    "air": "aqi_improvement",
    "flood": "flood_managed_m3",
    "green": "canopy_added_m2",
}


class OptimizeRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    hazard: str = "heat"
    budget_inr: float = Field(default=5_000_000, ge=0, le=1e11)
    goal: str = Field(default="", max_length=300)


class OptimizeResponse(BaseModel):
    area_name: str | None = None
    hazard: str
    interventions: list[dict] = []
    impacts: dict = {}
    costs: dict = {}
    budget: dict = {}
    roi: dict = {}
    rationale: str = ""
    assumptions: list[str] = []
    confidence: dict | None = None
    trade_offs: list[str] = []
    source: str = "rule-based"


class _AIWhy(BaseModel):
    rationale: str = ""
    assumptions: list[str] = []


def _optimize_mix(hazard: str, budget: float, top_k: int = 5, max_share: float = 0.6) -> list[dict]:
    """Diversified greedy allocation: rank the library by primary-benefit-per-
    rupee, then round-robin `step` units into the top options within budget,
    capping any single intervention at `max_share` of the budget."""
    scored: list[tuple[float, dict]] = []
    for spec in interventions_for(hazard):
        _, coeff = _primary_metric(spec)
        cap = spec.get("capital_inr", 0)
        if coeff and coeff > 0 and cap > 0:
            scored.append((coeff / cap, spec))
    scored.sort(key=lambda x: -x[0])
    picked = [spec for _, spec in scored[:top_k]]

    counts = {s["key"]: 0 for s in picked}
    remaining = float(budget)
    progress = True
    while progress and remaining > 0:
        progress = False
        for spec in picked:
            step = int(spec.get("step", 1))
            cap = spec.get("capital_inr", 0)
            step_cost = cap * step
            spent = counts[spec["key"]] * cap
            if step_cost <= remaining and (spent + step_cost) <= max_share * budget:
                counts[spec["key"]] += step
                remaining -= step_cost
                progress = True

    return [
        {"type": SPECIES_BY_KEY[k].get("type", ""), "species": k, "count": v}
        for k, v in counts.items() if v > 0
    ]


def _short(name: str) -> str:
    return name.split(" (")[0].split(" /")[0]


@router.post("/optimize", response_model=OptimizeResponse)
def optimize(req: OptimizeRequest):
    cell = nearest_cell(req.lat, req.lng)
    if not cell or req.hazard not in _IMPACT_KEY:
        return OptimizeResponse(hazard=req.hazard)

    mix = _optimize_mix(req.hazard, req.budget_inr)
    eff = compute_effect(cell, mix)
    capital = eff["costs"]["capital_inr"]
    people = eff["impacts"]["people_benefited"]
    primary_val = eff["impacts"].get(_IMPACT_KEY[req.hazard], 0.0)
    metric_label, _ = _primary_metric(SPECIES_BY_KEY[mix[0]["species"]]) if mix else ("", 0)
    per_lakh = capital / 100_000 if capital else 0

    # per-intervention "why" (Part 3: show why every recommendation was chosen)
    interventions_out = []
    for m in mix:
        spec = SPECIES_BY_KEY[m["species"]]
        cob = (spec.get("co_benefits") or [None])[0]
        why = f"High {_primary_metric(spec)[0]} per rupee" + (f"; {cob}" if cob else "")
        interventions_out.append({
            **m,
            "name": _short(spec["name"]),
            "capital_inr": round(spec.get("capital_inr", 0) * m["count"], 0),
            "why": why,
        })

    budget = {
        "budget_inr": req.budget_inr,
        "allocated_inr": capital,
        "remaining_inr": round(req.budget_inr - capital, 0),
        "over_budget": capital > req.budget_inr,
        "utilization_pct": round(min(100.0, capital / req.budget_inr * 100), 1) if req.budget_inr else 0,
    }
    roi = {
        "primary_metric": metric_label,
        "primary_per_lakh": round(primary_val / per_lakh, 3) if per_lakh else 0,
        "people_per_lakh": round(people / per_lakh, 1) if per_lakh else 0,
        "cost_per_person_inr": round(capital / people) if people else None,
    }

    plan_names = ", ".join(f"{m['count']}× {m['name']}" for m in interventions_out) or "no fit"
    fallback_rationale = (
        f"For {cell['name']}, within ₹{int(req.budget_inr):,} the best {req.hazard} plan is "
        f"{plan_names} — chosen for the strongest {metric_label} per rupee while diversifying "
        f"across complementary measures. Projected: {primary_val} ({metric_label}), "
        f"~{people:,} people benefited, ₹{int(capital):,} capital."
    )
    assumptions_default = [
        "Coefficients are literature-informed and illustrative, not site-measured.",
        "Budget covers capital cost; maintenance is reported separately (see costs).",
        "Optimised for primary-hazard benefit per rupee, diversified across top options.",
        f"Unit costs are indicative for {req.hazard} interventions in an Indian-metro context.",
    ]

    ai = None
    if gemini_available() and mix:
        ai = generate_json(
            f"You are an urban-planning optimiser for Chennai. Hazard: {req.hazard}. Area: "
            f"{cell['name']} (feels-like {cell['feels_like_c']}C, AQI {cell['air_quality_index']}, "
            f"{cell['green_cover_pct']}% canopy, flood risk {cell['flood_risk']}, "
            f"~{cell['bus_commuters_daily']} daily commuters). Budget ₹{int(req.budget_inr)}. "
            f"Selected plan: {plan_names}. Projected {metric_label}: {primary_val}; people ~{people}; "
            f"capital ₹{int(capital)}. Return JSON: 'rationale' = 3 short sentences on why this mix "
            f"fits this location and budget; 'assumptions' = up to 4 short strings.",
            response_schema=_AIWhy,
        )
    if not isinstance(ai, dict):
        ai = None

    return OptimizeResponse(
        area_name=cell["name"],
        hazard=req.hazard,
        interventions=interventions_out,
        impacts=eff["impacts"],
        costs=eff["costs"],
        budget=budget,
        roi=roi,
        rationale=(ai or {}).get("rationale") or fallback_rationale,
        assumptions=(ai or {}).get("assumptions") or assumptions_default,
        confidence=eff.get("confidence"),
        trade_offs=eff["what_could_go_wrong"],
        source="gemini" if (ai and ai.get("rationale")) else "rule-based",
    )
