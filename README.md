# ClimaTwin — Urban Microclimate Decision Engine

> *"Don't just see the heat. Stand in the street, try a fix, and watch the city cool."*

An AI decision-intelligence platform for **urban climate resilience**. A city planner picks any spot in Chennai, **simulates an intervention** (native trees, cool roofs, shade, misting, permeable pavement), and instantly sees the **°C drop, who benefits, the cost, the trade-offs, a before/after, and a ready-to-submit proposal** — across **heat, flooding, and air quality**.

Built for the **Google Gen AI Academy APAC Hackathon** — Google tools, **free-tier-first** (≈ $0 to run).

## Why it's different
Existing tools (incl. Google's own Heat Resilience tool, EIE Tree Canopy Lab, cool-route apps) are **descriptive and planner-only** — they show *where* it's hot. ClimaTwin is **prescriptive + simulation-first + people-centered + multi-hazard**: act in the map, see the consequence.

## Stack (all Google, free tier)
- **Frontend:** React + TypeScript + Vite, Google Maps JS API (2D core), optional Photorealistic 3D Tiles (CesiumJS)
- **Backend:** FastAPI (Python) on Cloud Run
- **AI:** Gemini **Flash** via the **Google AI Studio free tier** (not Vertex AI)
- **Data/model:** BigQuery (+ BigQuery GIS / ML), Earth Engine (build-time exports), Air Quality + Pollen APIs

## Structure
```
frontend/   React + TS + Vite web app (PWA)
backend/    FastAPI API (microclimate/simulate/recommend/proposal/hotspots/ask)
data/       Earth Engine scripts, BigQuery SQL, species table, pre-gen images
models/     cooling-effect model (BigQuery ML / scikit-learn)
infra/      Dockerfile, Cloud Run / Cloud Build config
docs/       BUDGET.md, demo-script.md, responsible-ai.md, pitch outline
```

## Run locally
**Backend**
```bash
python -m venv backend/.venv
backend/.venv/Scripts/pip install -r backend/requirements.txt   # Windows
cp backend/.env.example backend/.env                             # then fill keys
backend/.venv/Scripts/uvicorn app.main:app --reload --app-dir backend
```
**Frontend**
```bash
cd frontend && npm install
cp .env.example .env        # add VITE_GOOGLE_MAPS_API_KEY
npm run dev
```

## Cost
Designed to run at **≈ $0** on free tiers. See [docs/BUDGET.md](docs/BUDGET.md). Never uses paid Gemini Pro or paid Vertex AI.
