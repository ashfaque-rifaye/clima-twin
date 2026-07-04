"""ClimaTwin API — FastAPI entrypoint.

Hardened for production: request logging, per-IP rate limiting, security
headers, validated inputs, honest data-source labels. Everything is designed
to run on free Google tiers.
"""
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import hardening
from .config import settings
from .gemini import gemini_available
from .routers import microclimate, simulate, recommend, proposal, hotspots, ask, point, grid

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = FastAPI(
    title="ClimaTwin API",
    version="0.2.0",
    description="Urban microclimate decision engine — heat, flood, air. Free-tier Google stack.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

hardening.install(app, rate_per_minute=settings.rate_limit_per_minute)


@app.middleware("http")
async def _cache_headers(request, call_next):
    """Never cache index.html (so the latest build always loads); cache hashed assets forever."""
    resp = await call_next(request)
    path = request.url.path
    if path.startswith("/assets/"):
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif "text/html" in resp.headers.get("content-type", ""):
        resp.headers["Cache-Control"] = "no-cache, must-revalidate"
    return resp


@app.get("/health", tags=["meta"])
def health():
    return {
        "status": "ok",
        "service": "climatwin-api",
        "version": "0.2.0",
        "ai": "gemini-flash (ai-studio free tier)",
        "gemini": gemini_available(),
        "live_data": bool(settings.server_api_key or settings.google_maps_api_key),
    }


@app.get("/config", tags=["meta"])
def config():
    """Runtime config for the frontend (Maps key served here, not baked into the build)."""
    return {
        "maps_api_key": settings.google_maps_api_key,
        "has_maps": bool(settings.google_maps_api_key),
    }


app.include_router(microclimate.router)
app.include_router(simulate.router)
app.include_router(recommend.router)
app.include_router(proposal.router)
app.include_router(hotspots.router)
app.include_router(ask.router)
app.include_router(point.router)
app.include_router(grid.router)

# Serve the built frontend (present in the container image at /app/static).
# Mounted last so API routes above take precedence; skipped in local dev.
_STATIC = Path(__file__).resolve().parent.parent / "static"
if _STATIC.is_dir():
    app.mount("/", StaticFiles(directory=str(_STATIC), html=True), name="spa")
