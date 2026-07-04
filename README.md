# ClimaTwin — Urban Microclimate Decision Engine

> **One-liner:** *"Don't just see the heat. Stand in the street, try a fix, and watch the city cool."*
> **Google Gen AI Academy — APAC Hackathon** · Demo city: **Chennai, India** · Hero user: **City / government planner**
> **Hazards:** 🔥 Heat · 🌊 Flood/waterlogging · 🌫️ Air quality · 🌿 Green infrastructure
> **Runtime cost:** ≈ **$0** (Google free tiers) · **Live:** https://climatwin-980129431310.asia-south1.run.app

An AI decision-intelligence platform for **urban climate resilience**. A planner picks any point in Chennai, sees the **live microclimate** there, **simulates an intervention** (native trees, cool roofs, shade, misting, permeable pavement, rain gardens), and instantly gets the **°C drop, who benefits, the cost, the ROI, the trade-offs, and a ready-to-export proposal** — across heat, flood, air, and green-corridor layers.

Prescriptive + simulation-first + people-centered + multi-hazard — the white space the descriptive, planner-only incumbents (Google Heat Resilience, EIE / Tree Canopy Lab, cool-route apps, AI tree-planting tools) don't occupy.

---

## 0. Status at a glance (as-built)

| | |
|---|---|
| **Deployed** | ✅ Live on Cloud Run — `asia-south1` (revision `climatwin-00022-s4j` at time of writing) |
| **Frontend** | React 19 + TypeScript + Vite · **Google Maps** (`@vis.gl/react-google-maps`) + **deck.gl** overlays · Zustand store |
| **Backend** | FastAPI (Python) on Cloud Run · Gemini **Flash** (AI Studio free tier) with offline rule-based fallback |
| **Live data** | Google **Weather API** (heat), **Air Quality API** (AQI), **Elevation API** (flood model), **Geocoding** (place names + search) |
| **AI** | Gemini `gemini-2.5-flash` — recommend / ask / proposal, all with graceful offline fallbacks |
| **Design system** | Reproduced from the mockups → `docs/DESIGN-SYSTEM.md` (Manrope + Roboto Mono, Google-blue palette, dark-glass) |
| **Cost** | ~$0 — no Vertex AI, no paid endpoints, no 3D Tiles |

> **Honesty note:** several items in the original plan (Earth Engine, BigQuery ML, WorldPop, Pollen, Firestore, Imagen, 3D Tiles) were **not** shipped in this build — they were replaced by lighter, free, no-registration equivalents or deferred. See **§5 What changed** and **§6 Working vs. not working** for the precise state.

---

## 1. Live demo — how to use it

Open **https://climatwin-980129431310.asia-south1.run.app** (hard-refresh once, `Ctrl+Shift+R`, if you've opened it before).

1. **Pick a layer** in the top bar: **Heat / Flood / Air / Green**.
2. **Click anywhere on the map** → the right HUD fills with the live readout at that exact coordinate (place name, coords, feels-like/AQI/flood/elevation, NDVI, vulnerability index) + an AI forecast.
3. **Simulate a fix** (Planner view → *Simulate Intervention* card): add interventions with the ± steppers, move the **budget slider**, hit **Simulate** → before/after bars, people helped, cost, **ROI**, and a "what could go wrong" note. A **cooling ripple** animates out from the point on the map.
4. **Compare scenarios:** *Save as A*, change the mix, *Save as B* → side-by-side table with a "best cooling per ₹" verdict.
5. **AI Proposal · Gemini:** reads the forecast + recommendation, **Export** a Markdown proposal, **Regenerate**, or **Ask ClimaTwin** a plain-language question.
6. **Views:** toggle **Planner** (full toolset) vs **Citizen** (read-only microclimate + vulnerability). **Basemap:** Map ⇄ Satellite. **Scenario timeline:** diurnal clock scrubber.

---

## 2. What's included (built & shipping)

**Map visualization (Google Maps + deck.gl, dark vector, tilted "digital-twin" view)**
- Four hazard layers, each with its own visual identity — **never plain circles**:
  - 🔥 **Heat** — continuous thermal field (`HeatmapLayer`) + neon heat-canyon corridors.
  - 🌊 **Flood** — glowing rivers/canals, animated **drainage flow arrows**, detention/basin infrastructure nodes (status-coloured).
  - 🌫️ **Air** — dispersion field + **animated particle flux** streaming along wind/traffic corridors, coloured by an AQI ramp.
  - 🌿 **Green** — glowing biodiversity-corridor network, park hubs, and **fragmentation warnings**.
- **Densified accurate field** — the coarse real grid is IDW-interpolated into ~1,000+ render points (added resolution, anchored to the real samples, not fake precision).
- **28 labelled real Chennai localities**, priority **hotspots**, selection ring, and a **cooling-ripple** animation after simulations.
- **Neon glow** (layered soft + bright-core lines) approximating the reference mockups.

**Decision HUD & sidebar**
- Live **Microclimate Analysis** (feels-like / NDVI / AQI / flood / elevation, exact coordinate).
- **Vulnerability Index** (commuter footfall, elderly %, population, sensor coverage / **data blind spot**).
- **Simulate Intervention** (palette, budget slider, before/after bars, people helped, cost, **ROI**, pre-mortem).
- **Scenario A/B compare** with a best-value verdict.
- **AI Proposal · Gemini** (forecast + recommendation, Export `.md`, Regenerate, Ask box).

**Platform**
- Header with brand, **location search** (Google Geocoder), hazard toggle, **Planner/Citizen** view switch, Share.
- Map overlays: selected-zone card, legend + gradient bar, basemap toggle, zoom, **scenario timeline**.
- Real-time `/point` readout, AI endpoints with offline fallback, proposal export, error boundary + map-repaint safeguard.

**AI (Gemini Flash, free tier)**
- `/recommend` (ranked intervention mix + rationale + trade-offs), `/ask` (plain-language Q&A), `/proposal` (Markdown draft). All degrade to rule-based responses if the key/quota is unavailable.

---

## 3. Architecture (as-built)

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend — React 19 + TS + Vite  (served by FastAPI on Cloud Run)
│  • Google Maps (@vis.gl/react-google-maps) dark vector, tilt  │  ← live map, never artwork
│  • deck.gl overlays  (HeatmapLayer · ScatterplotLayer ·       │
│    PathLayer · IconLayer · TextLayer) — per-hazard identity    │
│  • Zustand store (state) · services/api (fetch) · features/*   │
│  • Light top bar · dark map · 384px light sidebar HUD          │
└───────────────▲──────────────────────────────────────────────┘
                │ REST / JSON
┌───────────────┴──────────────────────────────────────────────┐
│ Backend — FastAPI on Cloud Run                                 │
│  /health /config /microclimate /point /grid /hotspots          │
│  /simulate /recommend /ask /proposal                           │
└──┬─────────────────┬───────────────────┬──────────────────────┘
   ▼                 ▼                   ▼
 Google Maps       Gemini API          Rule-based engine + curated data
 Environment       (AI Studio,         • cooling coefficients (literature-informed)
 APIs:             FREE Flash)         • Chennai sample dataset (vulnerability, species)
 Weather · Air     reason · ask ·      • IDW densifier / hotspot ranking
 Quality ·         proposal            (no Earth Engine / BigQuery / Vertex in this build)
 Elevation ·
 Geocoding
```

**Frontend module layout (production-structured):**
```
frontend/src/
├─ store/useClimaStore.ts      Zustand state (hazard, selection, point, sim, scenarios, view, timeline)
├─ services/api.ts             typed API layer (getJSON/postJSON + all endpoints)
├─ features/
│  ├─ layout/Header.tsx        light top bar (search, hazard toggle, view toggle)
│  ├─ map/MapStage.tsx         Google Map + deck overlay + repaint safeguard + animation loop
│  ├─ map/layers.ts            per-hazard deck.gl layers, particles, ripple, glow
│  ├─ map/densify.ts           IDW interpolation of the real grid → dense field
│  ├─ map/overlays/*           selected-zone, legend, basemap toggle, zoom, timeline
│  ├─ hazards/hazardMeta.ts    per-hazard colour/legend/copy (single source of truth)
│  ├─ sidebar/*                Microclimate · Vulnerability · Simulate · AI Proposal cards
│  └─ simulation/palette.ts    intervention catalogue
├─ lib/format.ts               formatting + diurnal/AQI helpers
├─ App.tsx / App.css           shell + full stylesheet (docs/DESIGN-SYSTEM.md tokens)
└─ ErrorBoundary.tsx
```

---

## 4. Data & AI sources (live vs. sample — honest)

| Layer / field | Source in this build | Status |
|---|---|---|
| Heat (feels-like, temp, condition, humidity) | **Google Weather API** | ✅ live, per point |
| Air (AQI, category, dominant pollutant, health) | **Google Air Quality API** | ✅ live, per point |
| Flood (risk, rain probability, basis) | **Google Elevation API** + Weather rainfall (heuristic model) | ✅ live-derived (not a hydrological model) |
| Place name / search | **Google Geocoding API** (reverse + forward) | ✅ live |
| Hazard field grid (`/grid`) | Coarse sampled grid + **client-side IDW densify** | ⚠️ illustrative, interpolated (not survey-grade) |
| Vulnerability (NDVI, green %, footfall, elderly %, population, blind spot) | **Curated Chennai sample dataset** | ⚠️ sample, not live census/WorldPop/EE |
| Green corridors / park hubs / fragmentation | **Curated geometry** | ⚠️ synthetic, not live |
| Interventions + cooling effect | **Rule-based coefficient engine** (literature-informed) | ⚠️ heuristic, not a trained ML model |
| Recommend / Ask / Proposal | **Gemini `gemini-2.5-flash`** (AI Studio free tier) + offline fallback | ✅ live AI |

---

## 5. What changed vs. the original plan

**Replaced / dropped (with reasons):**
- **Map engine** — kept **Google Maps** as the foundation (per requirement) and layered **deck.gl** for the neon "digital-twin" visuals. A brief MapLibre/CARTO experiment was reverted. **Photorealistic 3D Tiles / CesiumJS were dropped** (paid session risk + complexity); deck.gl tilt gives a pseudo-3D feel for free.
- **Cooling model** — the planned **BigQuery ML / Earth Engine** pipeline was replaced with a **rule-based coefficient engine** in the backend. This keeps runtime free and needs no Earth Engine registration; it's honest as "illustrative," not survey-grade.
- **Real geodata** — **Earth Engine LST/NDVI/NDBI/DEM exports** and **WorldPop/Census** were **not** wired; vulnerability/green data is a **curated Chennai sample**. Heat/air/flood readouts *are* live (Weather/Air Quality/Elevation).
- **Before/after** — **Imagen / pre-generated images were dropped**; before/after is shown as **numeric bars** (feels-like before → after), not imagery.
- **Pollen API** — planned for species trade-offs; **not wired** in this build.
- **Firestore** — saved scenarios are **in-memory** (session only), not persisted.

**Added beyond the original plan:**
- 🌿 **Green Infrastructure** as a full 4th layer (corridor network + fragmentation warnings).
- **Animated air particle flux**, **densified accurate point field** + 28 locality labels, **cooling-ripple** animation.
- **Scenario A/B compare** with best-value verdict; **ROI** (₹/person, °C per ₹-lakh).
- **Planner / Citizen** views; **Map/Satellite** basemap toggle; **diurnal scenario timeline**.
- Full **design system** reproduced from the mockups (`docs/DESIGN-SYSTEM.md`), Manrope + Roboto Mono, dark-glass.
- Production architecture: **Zustand store + services + feature modules**; automatic **code-splitting** (initial JS 929 KB → 213 KB, deck.gl lazy-loaded).

---

## 6. Working vs. not working

**✅ Working (verified serving on the deployed URL)**
- Deployed Cloud Run app; `/health`, `/config`, `/point`, `/grid`, `/hotspots`, `/simulate`, `/recommend`, `/ask`, `/proposal` all respond 200.
- 4 hazard layers render as deck.gl overlays on the live Google Map; click-to-inspect at exact coordinates.
- Live heat (Weather) + air (Air Quality) + modeled flood (Elevation) readouts; reverse-geocoded place names; forward search.
- Simulate loop (palette, budget, before/after bars, people, cost, ROI, pre-mortem), scenario A/B compare, cooling ripple.
- Gemini-powered recommend / ask / proposal (live) with offline rule-based fallback; proposal `.md` export.
- Planner/Citizen views, basemap toggle, scenario timeline, responsive layout, error boundary + map repaint safeguard.

**⚠️ Partial / illustrative**
- Hazard field density is **interpolated** from a coarse grid (visual, not measurement-grade).
- Vulnerability + green-corridor data is a **curated sample**, not live census/satellite.
- Flood is a **heuristic** (elevation + rainfall), not a calibrated hydrological model.
- Scenario timeline is a **visual diurnal scrubber**; it does not fetch real time-series.

**❌ Not implemented yet**
- Earth Engine LST/NDVI/DEM exports · BigQuery + BigQuery ML cooling model · WorldPop/Census population.
- Pollen API species trade-offs · Imagen before/after imagery · Photorealistic 3D Tiles.
- Firestore persistence (scenarios are session-only) · authentication (structure-ready only) · PWA install/offline.
- Multi-city (Chennai only) · deep mobile-device QA.

**Known caveat:** map visuals were validated by build + endpoint checks, not automated pixel tests — visual tuning (layer density/opacity/animation speed) is best confirmed in a real browser.

---

## 7. API endpoints (backend)

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | service + AI status |
| `/config` | GET | runtime Maps key (referrer-restricted), feature flags |
| `/point?lat&lng` | GET | live per-coordinate readout (heat/air/flood/vulnerability + AI forecast) |
| `/grid?hazard=` | GET | hazard field points for the map overlay |
| `/hotspots?hazard=&limit=` | GET | equity-weighted priority ranking |
| `/microclimate?lat&lng` | GET | grid-based microclimate readout |
| `/simulate` | POST | intervention → Δtemp, people, cost, co-benefits, risks |
| `/recommend` | POST | Gemini ranked mix + rationale + trade-offs (fallback: rule-based) |
| `/ask` | POST | plain-language Q&A (Gemini, fallback) |
| `/proposal` | POST | Gemini-drafted Markdown proposal (fallback) |

---

## 8. Run locally

**Backend**
```bash
python -m venv backend/.venv
backend/.venv/Scripts/pip install -r backend/requirements.txt   # Windows
copy backend\.env.example backend\.env                          # add GEMINI_API_KEY, Maps key
backend/.venv/Scripts/python -m uvicorn app.main:app --reload --app-dir backend --port 8000
```
**Frontend**
```bash
cd frontend && npm install
copy .env.example .env        # add VITE_GOOGLE_MAPS_API_KEY (or served via backend /config)
npm run dev                   # http://localhost:5173
```
Keys used: **GEMINI_API_KEY** (AI Studio free tier), a **Google Maps key** (Maps JS + Weather + Air Quality + Elevation + Geocoding, referrer/API-restricted). All within free tiers.

## 9. Deploy (Cloud Run)
```bash
gcloud run deploy climatwin --source . --region asia-south1 --allow-unauthenticated
```
Single container (FastAPI serves the built React app). Secrets (Gemini + Maps keys) live in **Secret Manager** and persist across `--source` redeploys. Project: `climatwin-chennai` (billing: Google AI Pro account).

---

## 10. Cost

Designed to run at **≈ $0** on Google free tiers — see `docs/BUDGET.md`. **No Vertex AI, no paid Gemini Pro, no paid model endpoint, no 3D Tiles.** Live API calls happen **only for the selected point**; the map field is precomputed/derived. Gemini Flash: 1,500 req/day free. The only theoretical spend triggers (3D Tiles > 1,000 sessions/mo, or a Pro model) are not used here.

---

## 11. Roadmap (next, in priority order)

1. **Real geodata** — Earth Engine LST/NDVI/DEM → BigQuery grid; WorldPop/Census population & elderly density.
2. **Credible model** — BigQuery ML / scikit-learn LST regression to replace the coefficient heuristic; keep uncertainty bands.
3. **Persistence & auth** — Firestore-saved scenarios + shareable links; authentication (structure already split for it).
4. **Pollen + species trade-offs**, **Imagen before/after imagery**, **live green-canopy data**.
5. **Scale** — parameterize beyond Chennai to more cities; deeper mobile/PWA polish; optional 3D tab.

---

## 12. Responsible & explainable AI

Every °C / people / cost figure is labelled **illustrative** where it is heuristic; AI text is clearly attributed to **Gemini**; equity weighting prioritises **vulnerable + data-poor ("blind spot")** areas; only **aggregate** data is used (no personal info). Where data is sample or interpolated, this README (§4, §6) says so plainly — no overclaiming.
