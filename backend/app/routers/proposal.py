"""POST /proposal — draft an exportable planner proposal for a chosen plan."""
import json

from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator

from ..gemini import generate_json, gemini_available

router = APIRouter(tags=["proposal"])


class _AIProposal(BaseModel):
    """Structured proposal sections — the server renders the markdown, so the
    section layout is guaranteed regardless of model formatting."""
    problem: str = ""
    intervention: str = ""
    expected_impact: str = ""
    cost: str = ""
    risks: list[str] = []
    recommendation: str = ""


def _render(title: str, p: dict) -> str:
    risks = p.get("risks") or ["—"]
    return (
        f"# {title}\n\n"
        f"## Problem\n{p.get('problem', '').strip()}\n\n"
        f"## Proposed intervention\n{p.get('intervention', '').strip()}\n\n"
        f"## Expected impact\n{p.get('expected_impact', '').strip()}\n\n"
        f"## Cost\n{p.get('cost', '').strip()}\n\n"
        f"## Risks & mitigation\n" + "\n".join(f"- {r}" for r in risks) + "\n\n"
        f"## Recommendation\n{p.get('recommendation', '').strip()}\n"
    )


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
        ai = generate_json(
            "Draft a concise one-page funding proposal for a Chennai city planner to fund a "
            f"cooling intervention. Area: {req.area_name}. Plan + projected impact (JSON): "
            f"{json.dumps(req.plan)}. Return JSON with fields: problem, intervention, "
            "expected_impact, cost, risks (list of strings), recommendation. Tight and concrete.",
            response_schema=_AIProposal,
        )

    if isinstance(ai, dict) and ai.get("problem"):
        return ProposalResponse(title=title, markdown=_render(title, ai), source="gemini")

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
