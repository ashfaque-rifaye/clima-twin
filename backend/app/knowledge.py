"""Retrieval corpus for RAG-grounded /ask answers.

A small, curated knowledge base (intervention science, methodology, data
provenance, Chennai context) with a $0 keyword retriever. The ``retrieve`` seam
is deliberately swappable: for scale, replace the token-overlap scorer with a
vector retriever (e.g. Gemini text-embeddings + a nearest-neighbour index)
without changing callers.
"""
from __future__ import annotations

import re

# topic -> knowledge chunk. Kept short so retrieved context stays token-cheap.
CORPUS: list[dict] = [
    {"topic": "native trees", "text": "Native species like neem, pungai (pongamia) and portia are drought-tolerant, low-pollen and low-maintenance, giving dense canopy cooling of roughly 0.02–0.05°C per tree at street scale while improving air quality."},
    {"topic": "cool roofs", "text": "Reflective (high-albedo) roof coatings cut roof and near-surface air temperature; per US EPA cool-roof guidance they are a fast, low-cost heat intervention especially over large low-canopy roofscapes."},
    {"topic": "shade structures", "text": "Engineered shade sails give instant felt-temperature relief at bus stops and markets by cutting mean radiant temperature (Middel et al., ASU), even where trees cannot be planted."},
    {"topic": "misting", "text": "Evaporative misting points give a large local felt-temperature drop for waiting commuters but consume water, so usage should be metered during droughts."},
    {"topic": "permeable pavement", "text": "Permeable pavement reduces monsoon waterlogging by absorbing runoff and offers modest surface cooling; it needs maintenance before peak monsoon to avoid clogging."},
    {"topic": "rain gardens", "text": "Rain gardens and bioswales absorb monsoon runoff, cool and green the street, and are strong flood co-benefit interventions in low-lying areas."},
    {"topic": "cooling model", "text": "Projected cooling comes from a literature-informed coefficient engine cross-checked against a BigQuery ML linear land-surface-temperature model (R²≈0.70) trained on the Chennai grid; every number carries an uncertainty band and cited coefficients."},
    {"topic": "flood model", "text": "Flood risk is a heuristic from ground elevation (Google Elevation / SRTM) plus rainfall probability — lower-lying, near-waterway cells score higher. It is illustrative, not a calibrated hydrological model."},
    {"topic": "air quality", "text": "Air quality (AQI, dominant pollutant, health guidance) is read live per point from the Google Air Quality API; canopy near traffic corridors helps trap PM2.5."},
    {"topic": "data sources", "text": "Heat, air, elevation and place names are live Google APIs per point; the base grid is served from BigQuery and can be enriched with real Earth Engine LST/NDVI/NDBI/DEM; vulnerability is a census-informed model."},
    {"topic": "equity", "text": "Prioritisation is equity-weighted: vulnerable and data-poor ('blind spot') neighbourhoods are ranked above merely rich-and-hot ones, so investment reaches those who live the consequences."},
    {"topic": "chennai heat", "text": "Chennai sees 40–45°C feels-like heat; the worst local heat islands are dense, low-canopy, high-footfall areas like T. Nagar, Koyambedu and Guindy industrial estate."},
    {"topic": "chennai flooding", "text": "The 2015 Chennai floods caused ~₹15,000 crore in damage and 400+ lives; low-lying areas near the Pallikaranai marsh, Velachery and OMR remain waterlogging-prone in the monsoon."},
    {"topic": "vulnerability", "text": "Vulnerability blends commuter footfall, elderly share, population density and sensor coverage; areas with low data density are flagged as blind spots that need survey attention."},
    {"topic": "pollen", "text": "Pollen is read live where Google covers it; India has no live coverage, so tree/grass/weed pollen is modelled from local vegetation density and clearly labelled as modelled, not measured."},
    {"topic": "roi", "text": "Each plan reports cost, people helped, and value metrics (₹ per person, °C per ₹-lakh) so a planner can compare interventions on cooling-benefit-per-rupee before spending."},
]

_STOP = {
    "the", "and", "for", "are", "with", "that", "this", "what", "which", "how", "why",
    "does", "can", "will", "should", "from", "into", "over", "near", "per", "its", "was",
    "have", "has", "our", "you", "your", "how's", "where", "when", "who", "a", "an", "is",
    "of", "in", "on", "to", "at", "by", "or", "be", "it", "as", "do",
}


def _tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) > 2 and t not in _STOP]


def retrieve(query: str, k: int = 3) -> list[dict]:
    """Top-k corpus chunks by query-term overlap (empty if nothing overlaps)."""
    q = set(_tokens(query))
    if not q:
        return []
    scored: list[tuple[int, dict]] = []
    for chunk in CORPUS:
        overlap = sum(1 for t in _tokens(chunk["text"] + " " + chunk["topic"]) if t in q)
        if overlap:
            scored.append((overlap, chunk))
    scored.sort(key=lambda x: -x[0])
    return [c for _, c in scored[:k]]
