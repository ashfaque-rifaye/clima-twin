"""POST /ask — plain-language question over Chennai's microclimate data.

Gemini (free Flash) answers grounded on the grid; offline fallback uses simple
heuristics so the box always responds.
"""
import json

from fastapi import APIRouter
from pydantic import BaseModel

from ..data import GRID
from ..gemini import generate, gemini_available

router = APIRouter(tags=["ask"])

_FIELDS = ("name", "feels_like_c", "air_quality_index", "green_cover_pct", "flood_risk", "bus_commuters_daily", "elderly_pct")


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str = ""
    source: str = "offline"


@router.post("/ask", response_model=AskResponse)
def ask(req: AskRequest):
    ctx = [{k: c.get(k) for k in _FIELDS} for c in GRID]

    ai = None
    if gemini_available():
        ai = generate(
            "You are ClimaTwin, an urban microclimate assistant for Chennai. "
            f"Area data (JSON): {json.dumps(ctx)}. "
            "Answer the planner's question in 2-3 sentences, plain English, citing area "
            f"names and numbers. No markdown. Question: {req.question}"
        )

    if ai:
        return AskResponse(answer=ai, source="gemini")

    hottest = max(GRID, key=lambda c: c["feels_like_c"])
    floody = [c["name"] for c in GRID if c.get("flood_risk") == "high"]
    worst_air = max(GRID, key=lambda c: c["air_quality_index"])
    return AskResponse(
        answer=(
            f"Hottest: {hottest['name']} ({hottest['feels_like_c']}°C feels-like). "
            f"Worst air: {worst_air['name']} (AQI {worst_air['air_quality_index']}). "
            f"Highest flood risk: {', '.join(floody) or 'none flagged'}. "
            f"(Add a Gemini key for full natural-language answers.)"
        ),
        source="offline",
    )
