"""POST /scenarios · GET /scenarios/{id} — persist & retrieve saved scenarios.

Backed by Firestore (deck S8) with an in-memory fallback, so a planner can save
an A/B comparison and share it by id. The store is selected once at import.
"""
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from ..data_access.scenarios import build_scenario_store

router = APIRouter(tags=["scenarios"])

_store = build_scenario_store()


class ScenarioIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    area_name: str | None = Field(default=None, max_length=120)
    interventions: list[dict] = Field(default_factory=list, max_length=50)
    effect: dict = Field(default_factory=dict)
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("effect")
    @classmethod
    def _bounded(cls, v: dict) -> dict:
        if len(json.dumps(v)) > 20_000:
            raise ValueError("effect payload too large")
        return v


class SavedScenario(BaseModel):
    id: str
    backend: str
    share_path: str


@router.post("/scenarios", response_model=SavedScenario)
def save_scenario(req: ScenarioIn):
    try:
        sid = _store.save(req.model_dump())
    except Exception as exc:  # cloud hiccup shouldn't 500 with a stack trace
        raise HTTPException(status_code=503, detail=f"could not persist scenario ({type(exc).__name__})")
    return SavedScenario(id=sid, backend=_store.backend, share_path=f"/scenarios/{sid}")


@router.get("/scenarios/{sid}")
def get_scenario(sid: str):
    try:
        scenario = _store.get(sid)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"could not read scenario ({type(exc).__name__})")
    if scenario is None:
        raise HTTPException(status_code=404, detail="scenario not found")
    return scenario
