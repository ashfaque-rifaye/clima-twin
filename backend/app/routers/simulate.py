"""POST /simulate — predict the effect of placing interventions at a location.

Cooling model v0: combines per-intervention coefficients from the species table
with the nearest cell's baseline. Transparent + labeled illustrative. Day 3:
swap the temperature delta for a BigQuery ML / scikit-learn LST model.
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..data import nearest_cell, SPECIES_BY_KEY

router = APIRouter(tags=["simulate"])


class Intervention(BaseModel):
    type: str  # tree | cool_roof | shade | misting | permeable | rain_garden
    species: str | None = None  # species/intervention key from the species table
    count: int = 1


class SimulateRequest(BaseModel):
    lat: float
    lng: float
    interventions: list[Intervention] = Field(default_factory=list)
    budget_inr: float | None = None


class SimulateResponse(BaseModel):
    area_name: str | None = None
    baseline_feels_like_c: float | None = None
    projected_feels_like_c: float | None = None
    delta_feels_like_c: float = 0.0
    cooled_area_m2: float = 0.0
    people_helped: int = 0
    cost_inr: float = 0.0
    over_budget: bool = False
    air_quality_change: str | None = None
    flood_change: str | None = None
    confidence: str = "illustrative (sample model)"
    what_could_go_wrong: list[str] = Field(default_factory=list)
    source: str = "sample"


_CANOPY_M2 = {"very_high": 80, "high": 55, "medium": 35, "low": 20}
_DELTA_CEILING_C = 6.0  # keep projections believable


@router.post("/simulate", response_model=SimulateResponse)
def simulate(req: SimulateRequest):
    cell = nearest_cell(req.lat, req.lng)
    if not cell:
        return SimulateResponse()

    delta = cost = area = 0.0
    risks: list[str] = []
    improves_air = reduces_flood = False

    for iv in req.interventions:
        spec = SPECIES_BY_KEY.get(iv.species or iv.type)
        if not spec:
            continue
        count = max(iv.count, 0)
        per = spec.get("cooling_c_per_tree") or spec.get("cooling_c_per_unit") or 0.0
        delta += per * count
        cost += spec.get("cost_inr_per_unit", 0) * count

        if spec["type"] == "tree":
            area += _CANOPY_M2.get(spec.get("shade", "medium"), 35) * count
            improves_air = True
            if not spec.get("native", False):
                risks.append(f"{spec['name']} is non-native — more maintenance/water.")
            if spec.get("water_need") == "high":
                risks.append(f"{spec['name']} is thirsty — risky in Chennai summers.")
        if spec.get("flood_reduction") in ("medium", "high"):
            reduces_flood = True
        if spec["type"] == "misting":
            risks.append("Misting points consume water — meter usage in droughts.")

    delta = min(delta, _DELTA_CEILING_C)
    baseline = cell["feels_like_c"]
    people = cell.get("bus_commuters_daily", 0) + int(cell.get("population", 0) * 0.05)

    return SimulateResponse(
        area_name=cell["name"],
        baseline_feels_like_c=baseline,
        projected_feels_like_c=round(baseline - delta, 1),
        delta_feels_like_c=round(delta, 1),
        cooled_area_m2=round(area, 0),
        people_helped=people,
        cost_inr=round(cost, 0),
        over_budget=bool(req.budget_inr is not None and cost > req.budget_inr),
        air_quality_change=(
            f"~{min(8, max(2, int(delta * 2)))} AQI points lower (canopy traps PM2.5)"
            if improves_air else None
        ),
        flood_change="monsoon waterlogging reduced (more permeable surface)" if reduces_flood else None,
        what_could_go_wrong=risks or ["No major risks flagged for this mix."],
    )
