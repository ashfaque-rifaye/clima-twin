"""POST /recommend — an optimal intervention mix + AI rationale for an area.

Builds a sensible benefit-per-rupee mix (rule-based, always works), then asks
Gemini (free Flash) for a plain-language rationale + trade-offs. Falls back to
a templated rationale when there's no key.
"""
from fastapi import APIRouter
from pydantic import BaseModel

from ..data import nearest_cell, SPECIES_BY_KEY
from ..model import compute_effect
from ..gemini import generate, gemini_available

router = APIRouter(tags=["recommend"])


class RecommendRequest(BaseModel):
    lat: float
    lng: float
    goal: str = "reduce heat for bus commuters"
    budget_inr: float | None = None


class RecommendResponse(BaseModel):
    area_name: str | None = None
    goal: str = ""
    interventions: list[dict] = []
    effect: dict = {}
    rationale: str = ""
    trade_offs: list[str] = []
    source: str = "rule-based"


def _suggest_mix(cell: dict, budget: float | None) -> list[dict]:
    commuters = cell.get("bus_commuters_daily", 0)
    mix = [
        {"type": "tree", "species": "pungai", "count": 80},
        {"type": "shade", "species": "shade_sail", "count": 2 if commuters > 1000 else 1},
        {"type": "cool_roof", "species": "cool_roof", "count": 6},
    ]
    if cell.get("flood_risk") == "high":
        mix.append({"type": "rain_garden", "species": "rain_garden", "count": 4})
    if budget:
        while compute_effect(cell, mix)["cost_inr"] > budget and mix[0]["count"] > 10:
            mix[0]["count"] -= 10
    return mix


@router.post("/recommend", response_model=RecommendResponse)
def recommend(req: RecommendRequest):
    cell = nearest_cell(req.lat, req.lng)
    if not cell:
        return RecommendResponse(goal=req.goal)

    mix = _suggest_mix(cell, req.budget_inr)
    eff = compute_effect(cell, mix)
    names = ", ".join(
        f"{m['count']}x {SPECIES_BY_KEY.get(m['species'], {}).get('name', m['species'])}" for m in mix
    )

    ai = None
    if gemini_available():
        ai = generate(
            f"You are an urban climate planner for Chennai. Goal: {req.goal} at {cell['name']}. "
            f"Now: feels-like {cell['feels_like_c']}C, AQI {cell['air_quality_index']}, "
            f"{cell['green_cover_pct']}% canopy, flood risk {cell['flood_risk']}, "
            f"~{cell['bus_commuters_daily']} daily bus commuters. "
            f"Plan: {names} -> projected -{eff['delta_feels_like_c']}C feels-like, "
            f"helps ~{eff['people_helped']} people, costs INR {int(eff['cost_inr'])}. "
            f"In 3 short sentences, plain English: why this fits, the main co-benefit, "
            f"and one risk to watch. No preamble, no markdown."
        )

    rationale = ai or (
        f"For {cell['name']}, this mix is the best value: it brings feels-like down about "
        f"{eff['delta_feels_like_c']}°C and helps ~{eff['people_helped']:,} people for "
        f"₹{int(eff['cost_inr']):,}. Native species (Pungai) keep water and pollen low, and it's "
        f"prioritised here because this is a high-footfall, low-canopy area."
    )

    return RecommendResponse(
        area_name=cell["name"],
        goal=req.goal,
        interventions=mix,
        effect=eff,
        rationale=rationale,
        trade_offs=eff["what_could_go_wrong"] or ["No major risks flagged for this mix."],
        source="gemini" if ai else "rule-based",
    )
