"""Professional report generation — HTML + DOCX (Parts 7–9)."""

_PAYLOAD = {
    "area_name": "T. Nagar",
    "lat": 13.0417, "lng": 80.2341, "hazard": "heat",
    "point": {
        "heat": {"feels_like_c": 43.1, "condition": "Sunny"},
        "air": {"aqi": 168, "category": "Bad"},
        "flood": {"risk": "medium"},
        "vulnerability": {"population": 14200, "commuter_footfall": "High", "elderly_pct": 8.2,
                          "green_cover_pct": 8, "ndvi": 0.12, "data_blind_spot": False},
        "elevation_m": 11.2,
    },
    "plan": {
        "interventions": [
            {"name": "Pungai", "species": "pungai", "count": 180, "capital_inr": 63000, "why": "High cooling per rupee"},
            {"name": "Cool bus shelter", "species": "cool_bus_shelter", "count": 12, "capital_inr": 1440000, "why": "Protects commuters"},
        ],
        "impacts": {"temp_reduction_c": 4.2, "aqi_improvement": 6, "flood_managed_m3": 0,
                    "canopy_added_m2": 9900, "carbon_seq_kg_year": 3780, "water_retention_l": 0, "people_benefited": 2150},
        "costs": {"capital_inr": 1503000, "maintenance_inr_year": 101400, "five_year_inr": 2010000, "ten_year_inr": 2517000},
        "trade_offs": ["Summer watering for the first three years."],
        "assumptions": ["Coefficients illustrative."],
    },
}


def test_report_html_has_all_sections(client):
    body = client.post("/report", json=_PAYLOAD).json()
    assert "T. Nagar" in body["title"]
    html = body["html"]
    for section in ["Executive Summary", "Study Area", "Current Environmental Assessment",
                    "Proposed Intervention Plan", "Impact Analysis", "Budget",
                    "Implementation Timeline", "Risk Assessment", "Appendices"]:
        assert section in html, section
    # data actually rendered
    assert "13.04170, 80.23410" in html
    assert "Pungai" in html and "Cool bus shelter" in html
    assert "Summer watering for the first three years." in html


def test_report_docx_streams_word_file(client):
    r = client.post("/report/docx", json=_PAYLOAD)
    assert r.status_code == 200
    assert "wordprocessingml" in r.headers["content-type"]
    assert "attachment" in r.headers["content-disposition"]
    # a real .docx is a zip starting with PK, and non-trivial in size
    assert r.content[:2] == b"PK"
    assert len(r.content) > 5000


def test_report_rejects_oversized_plan(client):
    big = {**_PAYLOAD, "plan": {"junk": "x" * 70_000}}
    assert client.post("/report", json=big).status_code == 422
