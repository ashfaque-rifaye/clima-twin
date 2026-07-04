"""GET /grid - dense synthetic Chennai field for map overlays."""
from fastapi import APIRouter
from pydantic import BaseModel

from ..data import GRID_SIZE, grid_points

router = APIRouter(tags=["grid"])


class GridPoint(BaseModel):
    lat: float
    lng: float
    weight: float
    value: float | int | str | None = None
    name: str | None = None
    flood_risk: str | None = None
    aqi: int | None = None
    feels_like_c: float | None = None


class GridResponse(BaseModel):
    hazard: str
    points: list[GridPoint]
    source: str = "synthetic"


@router.get("/grid", response_model=GridResponse)
def grid(hazard: str = "heat", n: int = GRID_SIZE):
    return GridResponse(hazard=hazard, points=grid_points(hazard, n))
