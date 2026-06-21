"""POST /recommend — Gemini-ranked optimal intervention mix for an area.

Day 4: Gemini Flash (free) ranks the best benefit-per-rupee mix, with
co-benefits, trade-offs (pollen/water) and a pre-mortem.
"""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["recommend"])


class RecommendRequest(BaseModel):
    lat: float
    lng: float
    goal: str = "reduce heat for bus commuters"
    budget_inr: float | None = None


class RecommendResponse(BaseModel):
    recommendations: list[dict] = []
    rationale: str = ""
    note: str = "stub — Gemini Flash recommend wired on Day 4"


@router.post("/recommend", response_model=RecommendResponse)
def recommend(req: RecommendRequest):
    # TODO Day 4: candidate generation + Gemini ranking + trade-offs
    return RecommendResponse()
