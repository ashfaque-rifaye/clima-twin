"""POST /proposal — draft an exportable planner proposal for a chosen plan."""
import json

from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator

from ..gemini import generate, gemini_available

router = APIRouter(tags=["proposal"])


class ProposalRequest(BaseModel):
    area_name: str = Field(min_length=1, max_length=120)
    plan: dict  # interventions + simulated effect

    @field_validator("plan")
    @classmethod
    def _plan_size(cls, v: dict) -> dict:
        if len(json.dumps(v)) > 20_000:
            raise ValueError("plan payload too large")
        return v


class ProposalResponse(BaseModel):
    title: str = ""
    markdown: str = ""
    source: str = "template"


@router.post("/proposal", response_model=ProposalResponse)
def proposal(req: ProposalRequest):
    title = f"Cooling proposal — {req.area_name}"

    ai = None
    if gemini_available():
        ai = generate(
            "Draft a concise one-page proposal in markdown for a Chennai city planner to fund a "
            f"cooling intervention. Area: {req.area_name}. Plan + projected impact (JSON): "
            f"{json.dumps(req.plan)}. Sections: Problem, Proposed Intervention, Expected Impact, "
            "Cost, Risks & Mitigation, Recommendation. Tight and concrete."
        )

    if ai:
        return ProposalResponse(title=title, markdown=ai, source="gemini")

    eff = req.plan.get("effect", {}) if isinstance(req.plan, dict) else {}
    md = (
        f"# {title}\n\n"
        f"## Problem\n{req.area_name} runs hot ({eff.get('baseline_feels_like_c', '—')}°C feels-like) "
        f"with low canopy and high footfall.\n\n"
        f"## Proposed intervention\nTargeted greening + shading + cool roofs.\n\n"
        f"## Expected impact\n- Feels-like: **−{eff.get('delta_feels_like_c', '—')}°C**\n"
        f"- People helped: **{eff.get('people_helped', '—')}**\n"
        f"- {eff.get('air_quality_change') or 'Air-quality co-benefit'}\n\n"
        f"## Cost\n₹{int(eff.get('cost_inr', 0)):,}\n\n"
        f"## Risks & mitigation\n" + "\n".join(f"- {r}" for r in eff.get('what_could_go_wrong', []) or ['—']) + "\n\n"
        f"## Recommendation\nApprove as a reversible pilot with a 6-month review.\n\n"
        f"_Add a Gemini key for an AI-authored proposal._"
    )
    return ProposalResponse(title=title, markdown=md, source="template")
