"""POST /simulate — predict the effect of placing interventions at a location."""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..data import nearest_cell
from ..model import compute_effect

router = APIRouter(tags=["simulate"])


class Intervention(BaseModel):
    type: str  # tree | cool_roof | shade | misting | permeable | rain_garden
    species: str | None = None
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


@router.post("/simulate", response_model=SimulateResponse)
def simulate(req: SimulateRequest):
    cell = nearest_cell(req.lat, req.lng)
    if not cell:
        return SimulateResponse()
    eff = compute_effect(cell, [iv.model_dump() for iv in req.interventions])
    return SimulateResponse(
        area_name=cell["name"],
        over_budget=bool(req.budget_inr is not None and eff["cost_inr"] > req.budget_inr),
        what_could_go_wrong=eff["what_could_go_wrong"] or ["No major risks flagged for this mix."],
        baseline_feels_like_c=eff["baseline_feels_like_c"],
        projected_feels_like_c=eff["projected_feels_like_c"],
        delta_feels_like_c=eff["delta_feels_like_c"],
        cooled_area_m2=eff["cooled_area_m2"],
        people_helped=eff["people_helped"],
        cost_inr=eff["cost_inr"],
        air_quality_change=eff["air_quality_change"],
        flood_change=eff["flood_change"],
    )
