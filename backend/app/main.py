"""ClimaTwin API — FastAPI entrypoint.

Routers are thin for now (Day 0 scaffold); real data/model wiring lands on
Day 1+ per the build plan. Everything is designed to run on free Google tiers.
"""
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .routers import microclimate, simulate, recommend, proposal, hotspots, ask, point, grid

app = FastAPI(
    title="ClimaTwin API",
    version="0.1.0",
    description="Urban microclimate decision engine — heat, flood, air. Free-tier Google stack.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
        "version": "0.1.0",
        "ai": "gemini-flash (ai-studio free tier)",
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
