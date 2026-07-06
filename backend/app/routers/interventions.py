"""GET /interventions?hazard= — the context-aware intervention library.

Each hazard mode gets its OWN planning strategy (heat / flood / air / green),
not a shared catalogue. The frontend fetches the library for the active layer so
the panel adapts to the problem being solved.
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel

from ..data import interventions_for
from ..model import _primary_metric

router = APIRouter(tags=["interventions"])


class InterventionOut(BaseModel):
    key: str
    name: str
    type: str
    unit: str
    step: int
    note: str
    capital_inr: float
    maintenance_inr_year: float
    primary_metric: str
    primary_coefficient: float
    co_benefits: list[str] = []


class InterventionsResponse(BaseModel):
    hazard: str
    count: int
    interventions: list[InterventionOut]


@router.get("/interventions", response_model=InterventionsResponse)
def interventions(hazard: str = Query("heat")):
    items = interventions_for(hazard)
    out = []
    for spec in items:
        metric, coeff = _primary_metric(spec)
        out.append(InterventionOut(
            key=spec["key"],
            name=spec["name"],
            type=spec.get("type", ""),
            unit=spec.get("unit", "unit"),
            step=int(spec.get("step", 1)),
            note=spec.get("note", ""),
            capital_inr=float(spec.get("capital_inr", 0)),
            maintenance_inr_year=float(spec.get("maint_inr_yr", 0)),
            primary_metric=metric,
            primary_coefficient=coeff,
            co_benefits=spec.get("co_benefits", []),
        ))
    return InterventionsResponse(hazard=hazard, count=len(out), interventions=out)
