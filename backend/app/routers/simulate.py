"""POST /simulate — predict the effect of placing interventions at a location.

Day 3: cooling-effect model (BigQuery ML / scikit-learn) + people-impact join.
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field

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
    delta_feels_like_c: float | None = None
    cooled_area_m2: float | None = None
    people_helped: int | None = None
    cost_inr: float | None = None
    air_quality_change: str | None = None
    confidence: str = "low"
    what_could_go_wrong: str | None = None
    note: str = "stub — cooling model wired on Day 3"


@router.post("/simulate", response_model=SimulateResponse)
def simulate(req: SimulateRequest):
    # TODO Day 3: predict LST delta + cooled polygon + people impact
    return SimulateResponse()
