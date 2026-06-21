"""GET /microclimate — point readout (heat, air, green, people) for a lat/lng.

Reads the local Chennai sample grid (nearest cell). Day 1+: swap to a
BigQuery-backed lookup + live Air Quality / Pollen for the exact point.
"""
from fastapi import APIRouter
from pydantic import BaseModel

from ..data import nearest_cell

router = APIRouter(tags=["microclimate"])


class MicroclimateResponse(BaseModel):
    lat: float
    lng: float
    area_name: str | None = None
    surface_temp_c: float | None = None
    feels_like_c: float | None = None
    air_quality_index: int | None = None
    dominant_pollutant: str | None = None
    green_cover_pct: float | None = None
    flood_risk: str | None = None  # low | medium | high
    population: int | None = None
    bus_commuters_daily: int | None = None
    elderly_pct: float | None = None
    data_density: str | None = None
    source: str = "sample"


@router.get("/microclimate", response_model=MicroclimateResponse)
def microclimate(lat: float, lng: float):
    cell = nearest_cell(lat, lng)
    if not cell:
        return MicroclimateResponse(lat=lat, lng=lng, source="none")
    return MicroclimateResponse(
        lat=lat,
        lng=lng,
        area_name=cell["name"],
        surface_temp_c=cell["surface_temp_c"],
        feels_like_c=cell["feels_like_c"],
        air_quality_index=cell["air_quality_index"],
        dominant_pollutant=cell.get("dominant_pollutant"),
        green_cover_pct=cell.get("green_cover_pct"),
        flood_risk=cell.get("flood_risk"),
        population=cell.get("population"),
        bus_commuters_daily=cell.get("bus_commuters_daily"),
        elderly_pct=cell.get("elderly_pct"),
        data_density=cell.get("data_density"),
        source="sample",
    )
