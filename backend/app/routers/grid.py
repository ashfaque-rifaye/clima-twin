"""GET /grid — a continuous field of weighted points for the map heat overlay.

heat = live Google Weather feels-like across a Chennai grid; flood = Google
Elevation (low ground => high weight). Air uses Air Quality heatmap tiles in the
frontend instead. Cached 30 min.
"""
from fastapi import APIRouter
from pydantic import BaseModel

from ..realtime import hazard_grid

router = APIRouter(tags=["grid"])


class GridResponse(BaseModel):
    hazard: str
    points: list[dict]


@router.get("/grid", response_model=GridResponse)
async def grid(hazard: str = "heat", n: int = 8):
    return GridResponse(hazard=hazard, points=await hazard_grid(hazard, n))
