"""POST /recommend — an optimal intervention mix + AI rationale for an area.

Builds a sensible benefit-per-rupee mix (rule-based, always works), then asks
Gemini (free Flash) for a plain-language rationale + trade-offs. Falls back to
a templated rationale when there's no key.
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..data import nearest_cell, SPECIES_BY_KEY
from ..model import compute_effect
from ..gemini import generate, gemini_available

router = APIRouter(tags=["recommend"])


class RecommendRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    goal: str = Field(default="reduce heat for bus commuters", max_length=300)
    budget_inr: float | None = Field(default=None, ge=0, le=1e10)


class RecommendResponse(BaseModel):
    area_name: str | None = None
    goal: str = ""
    interventions: list[dict] = []
    effect: dict = {}
    rationale: str = ""
    trade_offs: list[str] = []
    source: str = "rule-based"


def _goal_hazard(goal: str) -> str:
    text = goal.lower()
    if "flood" in text or "water" in text or "monsoon" in text:
        return "flood"
    if "air" in text or "aqi" in text or "pollution" in text:
        return "air"
    return "heat"


def _suggest_mix(cell: dict, budget: float | None, goal: str) -> list[dict]:
    commuters = cell.get("bus_commuters_daily", 0)
    hazard = _goal_hazard(goal)
    if hazard == "flood":
        mix = [
            {"type": "permeable", "species": "permeable", "count": 140 if commuters > 1000 else 90},
            {"type": "rain_garden", "species": "rain_garden", "count": 6 if cell.get("flood_risk") == "high" else 4},
            {"type": "tree", "species": "portia", "count": 35},
        ]
    elif hazard == "air":
        mix = [
            {"type": "tree", "species": "neem", "count": 90},
            {"type": "tree", "species": "pungai", "count": 45},
            {"type": "shade", "species": "shade_sail", "count": 1 if commuters <= 1000 else 2},
        ]
    else:
        mix = [
            {"type": "tree", "species": "pungai", "count": 80},
            {"type": "shade", "species": "shade_sail", "count": 2 if commuters > 1000 else 1},
            {"type": "cool_roof", "species": "cool_roof", "count": 6},
        ]
        if cell.get("flood_risk") == "high":
            mix.append({"type": "rain_garden", "species": "rain_garden", "count": 4})
    if budget:
        while compute_effect(cell, mix)["cost_inr"] > budget and mix and mix[0]["count"] > 10:
            mix[0]["count"] -= 10
    return mix


@router.post("/recommend", response_model=RecommendResponse)
def recommend(req: RecommendRequest):
    cell = nearest_cell(req.lat, req.lng)
    if not cell:
        return RecommendResponse(goal=req.goal)

    mix = _suggest_mix(cell, req.budget_inr, req.goal)
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

    hazard = _goal_hazard(req.goal)
    if hazard == "flood":
        fallback = (
            f"For {cell['name']}, this plan prioritises runoff absorption and local storage: "
            f"{names}. It also cools the street by about {eff['delta_feels_like_c']}C, helps "
            f"~{eff['people_helped']:,} people, and costs INR {int(eff['cost_inr']):,}. Watch "
            f"maintenance of permeable surfaces before peak monsoon."
        )
    elif hazard == "air":
        fallback = (
            f"For {cell['name']}, this plan uses pollution-tolerant canopy and shade where people wait: "
            f"{names}. It can lower exposure by {eff.get('air_quality_change', 'improving street-level air')}, "
            f"help ~{eff['people_helped']:,} people, and costs INR {int(eff['cost_inr']):,}. Keep planting "
            f"away from narrow choke points so airflow is not blocked."
        )
    else:
        fallback = (
            f"For {cell['name']}, this mix is the best value: {names}. It brings feels-like down about "
            f"{eff['delta_feels_like_c']}C and helps ~{eff['people_helped']:,} people for "
            f"INR {int(eff['cost_inr']):,}. It is prioritised here because this is a high-footfall, "
            f"low-canopy area."
        )

    rationale = ai or fallback

    return RecommendResponse(
        area_name=cell["name"],
        goal=req.goal,
        interventions=mix,
        effect=eff,
        rationale=rationale,
        trade_offs=eff["what_could_go_wrong"] or ["No major risks flagged for this mix."],
        source="gemini" if ai else "rule-based",
    )
