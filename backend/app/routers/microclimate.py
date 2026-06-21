"""GET /microclimate — point readout (heat, air, green) for a lat/lng.

Day 1: read the BigQuery grid cell + live Air Quality / Pollen for the point.
"""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["microclimate"])


class MicroclimateResponse(BaseModel):
    lat: float
    lng: float
    surface_temp_c: float | None = None
    feels_like_c: float | None = None
    air_quality_index: int | None = None
    dominant_pollutant: str | None = None
    green_cover_pct: float | None = None
    flood_risk: str | None = None  # low | medium | high
    note: str = "stub — wired to BigQuery grid + Air Quality API on Day 1"


@router.get("/microclimate", response_model=MicroclimateResponse)
def microclimate(lat: float, lng: float):
    # TODO Day 1: BigQuery grid lookup + live Air Quality/Pollen
    return MicroclimateResponse(lat=lat, lng=lng)
