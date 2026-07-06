"""POST /report (HTML) · POST /report/docx (Word) — professional planning report.

Replaces the markdown export with a decision-ready document (Parts 7–9). The
frontend fetches /report for the HTML (which it prints to PDF) and hits
/report/docx to download the Word version.
"""
import json

from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

from ..report import build_report, render_docx, render_html

router = APIRouter(tags=["report"])

_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class ReportRequest(BaseModel):
    area_name: str = Field(min_length=1, max_length=120)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    hazard: str = "heat"
    point: dict = Field(default_factory=dict)
    plan: dict = Field(default_factory=dict)

    @field_validator("point", "plan")
    @classmethod
    def _bounded(cls, v: dict) -> dict:
        if len(json.dumps(v)) > 60_000:
            raise ValueError("payload too large")
        return v


class ReportResponse(BaseModel):
    title: str
    html: str


@router.post("/report", response_model=ReportResponse)
def report(req: ReportRequest):
    r = build_report(req.area_name, req.lat, req.lng, req.hazard, req.point, req.plan)
    return ReportResponse(title=r["title"], html=render_html(r))


@router.post("/report/docx")
def report_docx(req: ReportRequest):
    r = build_report(req.area_name, req.lat, req.lng, req.hazard, req.point, req.plan)
    data = render_docx(r)
    safe = "".join(c for c in req.area_name if c.isalnum() or c in " -_").strip().replace(" ", "-") or "area"
    return Response(
        content=data,
        media_type=_DOCX_MIME,
        headers={"Content-Disposition": f'attachment; filename="ClimaTwin-Report-{safe}.docx"'},
    )
