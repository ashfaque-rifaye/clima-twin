"""POST /proposal — draft an exportable planner proposal for a chosen plan.

Day 5: Gemini Flash drafts a structured proposal (markdown) for export.
"""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["proposal"])


class ProposalRequest(BaseModel):
    area_name: str
    plan: dict  # the chosen interventions + simulated results


class ProposalResponse(BaseModel):
    title: str = ""
    markdown: str = ""
    note: str = "stub — Gemini proposal drafting wired on Day 5"


@router.post("/proposal", response_model=ProposalResponse)
def proposal(req: ProposalRequest):
    # TODO Day 5: Gemini-drafted proposal from the plan + impact numbers
    return ProposalResponse()
