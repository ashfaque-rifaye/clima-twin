"""GET /hotspots — priority list of areas to act on.

Day 4: rank grid cells by heat x vulnerability x data-sparsity (equity /
"blind spot" weighting), not just the hottest rich areas.
"""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["hotspots"])


class Hotspot(BaseModel):
    name: str
    lat: float
    lng: float
    priority_score: float
    why: str


class HotspotsResponse(BaseModel):
    hazard: str = "heat"
    hotspots: list[Hotspot] = []
    note: str = "stub — equity-weighted ranking wired on Day 4"


@router.get("/hotspots", response_model=HotspotsResponse)
def hotspots(hazard: str = "heat", limit: int = 5):
    # TODO Day 4: BigQuery ranking with equity + blind-spot weighting
    return HotspotsResponse(hazard=hazard)
