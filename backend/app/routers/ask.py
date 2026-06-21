"""POST /ask — plain-language question over the city's microclimate data.

Day 4: Gemini Flash (free) turns a natural-language question into an analysis
+ answer (conversational analytics).
"""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["ask"])


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str = ""
    used: list[str] = []  # which data/tools were consulted
    note: str = "stub — Gemini Flash conversational analytics wired on Day 4"


@router.post("/ask", response_model=AskResponse)
def ask(req: AskRequest):
    # TODO Day 4: route the question → data lookups → Gemini answer
    return AskResponse()
