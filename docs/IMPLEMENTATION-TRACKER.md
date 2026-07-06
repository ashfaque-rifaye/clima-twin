# ClimaTwin — Implementation Tracker

> Living document. The **deck is the source of truth**; this tracker records the
> systematic convergence of the implementation toward the deck's architecture,
> without regressing the (frozen) UI. Updated after every task.

**Baseline (start of program):** 47 backend tests + 30 frontend tests passing.

## DEPLOYED ✅ (2026-07-06)
Live on Cloud Run: **https://climatwin-980129431310.asia-south1.run.app** (service `climatwin`, revision `climatwin-00001-z5s`, `asia-south1`, 1 GiB / max-3).
- Runtime SA `980129431310-compute@…` granted `bigquery.dataViewer` + `bigquery.jobUser` + `datastore.user` → prod loads grid **from BigQuery**, BQML model served (R²=0.70), Firestore ready.
- Verified live: `/health` (grid_source=bigquery), `/point` (live Weather/Air/Elevation + modeled pollen + model_baseline), `/interventions` (per-hazard), `/optimize`, `/report` (1.4 MB HTML + embedded Static Maps), `/report/docx` (valid Word), SPA served, `/config` has_maps.
- **Known:** live Gemini is 429 rate-limited (AI Studio free-tier **daily** quota exhausted by today's dev/testing) → AI narratives fall back to deterministic templates until the daily reset. Not a defect; graceful by design. To restore immediately, swap `GEMINI_API_KEY` for a key with fresh quota and redeploy.
- **Not enabled (safe default):** `GRID_SOURCE=auto` (BigQuery synthetic-seeded). Set `GRID_SOURCE=ee_enriched` + redeploy to serve real Earth Engine satellite data on the map (changes demo numbers — your call).


**Legend — Status:** ⬜ not started · 🟨 in progress · ✅ done · 🚩 flagged (needs external resource) · ⏸ deferred to later phase

---

## Phase 1 — Critical (architecture integrity, backend correctness, AI reliability, production readiness)

| # | Task | Status | Deps | Files | Validation |
|---|---|---|---|---|---|
| 1.1 | Gemini hardening: safety settings, generation config, structured-JSON helper, response cache | ✅ | — | `backend/app/gemini.py`, `backend/app/config.py`, `backend/tests/test_gemini_client.py` | 54 backend + 30 frontend green |
| 1.2 | Confidence bands + cited coefficients in effect model; provenance in API | ✅ | — | `model.py`, `sample_data/species.json`, `routers/simulate.py`, `tests/test_confidence.py` | 58 backend green |
| 1.3 | Wire `/recommend` + `/proposal` to structured output | ✅ | 1.1, 1.2 | `routers/recommend.py`, `routers/proposal.py`, `tests/conftest.py`, `tests/test_structured_ai.py` | 66 backend + 30 FE green |
| 1.4 | Bound `realtime._cache` (LRU) — memory/scalability | ✅ | — | `realtime.py`, `tests/test_realtime_cache.py` | 61 backend green |
| 1.5 | `/ask` system instruction + prompt-injection guard | ✅ | 1.1 | `routers/ask.py`, `tests/test_ask_hardening.py` | 63 backend green |
| 1.6 | Grid repository abstraction + `BigQueryGridRepository` + loader | ✅ | 1.2 | `data_access/*`, `scripts/load_grid_to_bigquery.py`, `main.py`, `config.py`, `tests/test_data_access.py` | 69 backend green + **live BQ load verified** |
| 1.7 | BQML cooling model (train in BigQuery ML → serve in-process) | ✅ | 1.2, 1.6 | `app/ml/*`, `scripts/train_lst_model_bqml.py`, `main.py`, `routers/point.py`, `model.py`, `tests/test_lst_model.py` | 75 backend green + **live BQML train (R²=0.70)** |
| 1.8 | Live Pollen API + species trade-offs | ✅¹ | — | `realtime.py`, `routers/point.py`, `tests/test_pollen.py` | 77 backend green; **Pollen call confirmed working (London HTTP 200)** |
| 1.9 | Earth Engine build-time export → BigQuery | ✅ | 1.6 | `scripts/export_earth_engine.py`, `requirements-buildtime.txt` | **live EE→BQ verified**: 900 rows in `grid_ee`, LST 29.8–38.6 °C |

¹ **1.8 flag (needs product decision):** integration is fully built, tested, and **confirmed live** (London returns 200 with real data; Pollen API enabled + `climatwin-server` key allow-listed, existing 4 APIs preserved & regression-tested). **However, Google Pollen API has NO India coverage** — Chennai/Delhi/Bengaluru all return HTTP 400 "Information is unavailable for this location." So for the Chennai demo the block degrades gracefully to `None`. The capability is real and global-ready; the *data* doesn't exist for the demo city. **Decision for you:** keep it as a global-ready live call (honest, works where covered), and/or note Pollen as "no India coverage yet" — the deck lists Pollen as a live source, which is technically true but undemonstrable in Chennai.

### Deployment notes (to activate cloud paths in the deployed Cloud Run service)
- **BigQuery grid (1.6):** grant the Cloud Run runtime service account read access, then redeploy:
  `gcloud projects add-iam-policy-binding climatwin-chennai --member=serviceAccount:<RUNTIME_SA> --role=roles/bigquery.dataViewer` and `roles/bigquery.jobUser`. Grid seeded via `python backend/scripts/load_grid_to_bigquery.py --project climatwin-chennai`. Local dev works today via ADC.

## Phase 1 — COMPLETE ✅
All 9 tasks done and validated. **77 backend tests + 30 frontend tests green.** Live-verified against the user's GCP (`climatwin-chennai` / `ai-pro-developer`): grid loads from BigQuery, BQML model trained (R²=0.70) & served in-process, Earth Engine LST/NDVI/NDBI/DEM exported to `grid_ee`. No UI changed; all API changes additive.

**Open flags for user review (do not block Phase 2 start):**
1. **Pollen live activation** — pending key-restriction propagation (see ¹). Verify it returns data.
2. **EE grid-enrichment swap** — `grid_ee` holds real satellite LST/NDVI/DEM. Joining it into `grid_cells` (replacing synthetic surface_temp/ndvi/elevation) would make the *displayed* grid real satellite data, but changes every demo number → **needs your sign-off** before enabling. Planned as a Phase 2 task, gated on approval.
3. **Cloud Run prod activation of BigQuery grid** — grant the runtime SA `bigquery.dataViewer` + `jobUser` (command in Deployment notes) so the deployed app uses BQ, not the synthetic fallback.

## Phase 2 — Medium (started)

| # | Task | Status | Deps | Files | Validation |
|---|---|---|---|---|---|
| 2.1 | Synthetic pollen fallback for India (modeled where no live coverage) | ✅ | — | `pollen_model.py`, `routers/point.py`, `tests/test_pollen.py` | 79 backend green |
| 2.2 | EE grid-enrichment as a validated toggle (`grid_source=ee_enriched`, hybrid) | ✅ | 1.6, 1.9 | `data_access/ee_enriched.py`, `data_access/__init__.py`, `config.py`, `tests/test_ee_enriched.py` | 84 backend green + **live: 630/900 cells enriched** |
| 2.3 | Anomaly detection endpoint (`/anomalies`) — "patterns/anomalies" | ✅ | 1.6 | `routers/anomalies.py`, `main.py`, `tests/test_anomalies.py` | 87 backend green |
| 2.4 | RAG grounding for `/ask` (retrieval over a small corpus) | ✅ | 1.1 | `knowledge.py`, `routers/ask.py`, `tests/test_rag.py` | 95 backend green |
| 2.5 | Firestore persistence for saved scenarios (deck S8) | ✅ | — | `data_access/scenarios.py`, `routers/scenarios.py`, `config.py`, `requirements.txt`, `tests/test_scenarios.py` | 99 backend green + **live Firestore save/read verified** |
| 2.6 | Observability — request IDs (propagated), in log lines + error bodies | ✅ | — | `hardening.py`, `tests/test_observability.py`, `tests/test_hardening.py` | 90 backend green |
| 2.7 | Dead-dep cleanup (`maplibre-gl`, `db-dtypes`) + requirements hygiene | ✅ | — | `frontend/package.json`, `requirements.txt` | 30 FE + 87 BE green |
| 2.8 | `/grid` latency — non-blocking background live-anchor refresh | ✅ | — | `realtime.py`, `tests/test_grid_latency.py` | 102 backend green + **live: 2767ms→596ms** |

## Phase 2 — COMPLETE ✅
All 8 tasks done and validated. **102 backend tests + 30 frontend tests green.** Live-verified: modeled pollen for India, EE-enriched grid toggle (630/900 real cells), `/anomalies`, RAG-grounded `/ask`, Firestore scenario persistence, request-id observability, dead-dep cleanup, non-blocking `/grid`. No UI changed; all API changes additive.

**Open Phase-3 items surfaced during Phase 2 (UI-exposed):**
- Wire a "Share scenario" UI action to `POST /scenarios` / `GET /scenarios/{id}` (backend ready).
- Surface confidence bands + citations + `/anomalies` + modeled-pollen labels in the UI (backend ready).
- CesiumJS 3-D gated tab, PWA (deck S8/S9/S16).
- Residual `/grid` ~596ms is CPU serialization of 900 points — optional response-cache optimization.

## Phase 3 — AI Urban Planning Decision Support System (in progress)
Scope expanded by user: redesign the intervention engine, simulation workflow, budget optimizer, scenario comparison, and report generation (not a UI restyle — functional logic; visual language preserved).

| # | Task | Status | Deps | Files | Validation |
|---|---|---|---|---|---|
| 3.1 | Context-aware intervention libraries (per-hazard) + `/interventions?hazard=` | ✅ | — | `sample_data/interventions.json` (46 items), `data.py`, `routers/interventions.py`, `tests/test_interventions.py` | 107 backend green |
| 3.2 | Multi-metric impact model (temp/flood/AQI/canopy/carbon/water/capital/maintenance) | ✅ | 3.1 | `model.py`, `routers/simulate.py` | 107 backend green |
| 3.3 | AI recommendation + budget optimizer (fixed budget → optimal mix, why/confidence) | ✅ | 3.1, 3.2 | `routers/optimize.py`, `main.py`, `tests/conftest.py`, `tests/test_optimize.py` | 111 backend green + live-previewed |
| 3.4 | Frontend: context-aware panel, 2 budget workflows, rich sim output, A/B/C compare | ✅ | 3.1–3.3 | `services/api.ts`, `store/useClimaStore.ts`, `SimulateCard.tsx`, `App.tsx`, `App.css` | tsc 0 errors + 30 FE tests + live API verified (Gemini live) |
| 3.5 | Professional report pipeline (HTML + DOCX + AI narrative + embedded maps + 7-step UX) | ✅ | 3.2–3.4 | `report.py`, `routers/report.py`, `services/api.ts`, `store`, `ProposalCard.tsx`, `App.css`, `tests/test_report.py` | 114 backend + 30 FE green; live `/report`+`/report/docx` verified (AI narrative + maps) |

## Phase 3 — COMPLETE ✅
All Parts 1–9 of the AI Urban Planning Decision Support System delivered.
**114 backend tests + 30 frontend tests green; tsc clean; live-verified** (per-hazard libraries, budget optimizer with live Gemini, professional HTML/DOCX report with embedded Google Static Maps + AI narrative).

Report architecture: **PDF via browser print** of the backend-rendered HTML (no fragile canvas capture); **maps via server-side Google Static Maps** downloaded + base64-embedded (works in any viewer + DOCX); **DOCX via python-docx**.

GCP added this phase: enabled Static Maps API + added it to the server key (existing APIs preserved); `python-docx` runtime dep.

Deferred UI stretch (optional, not required by the deck's core): CesiumJS 3-D gated tab, PWA, a11y polish.
- **P3.x — Surface confidence bands + citations in the UI.** Backend already returns
  `confidence_detail` + `citations` on `/simulate` (task 1.2). A small SimulateCard
  addition should render the band + a "sources" disclosure to make the deck's
  "confidence bands + cited coefficients" visible to a judge using the app.
  (Deferred here to honor the UI freeze; data is production-ready now.)

---

## Task log

### 1.1 — Gemini client hardening ✅
- **Why:** Deck promises explainable, responsible AI; the client sent bare prompts with no safety settings, no generation config, no structured output, and re-billed identical calls.
- **Gap closed:** Responsible-AI configuration (safety), deterministic/bounded generation, JSON-mode helper for structured endpoints, in-process LRU cache (latency + free-tier quota protection).
- **Approach:** Backward-compatible. `generate()` signature preserved (routers + tests untouched). Added `generate_json()` and an LRU cache; config is lazily built so a missing SDK still degrades to rule-based fallbacks.
- **Files:** `backend/app/gemini.py` (rewrite), `backend/app/config.py` (+3 settings), `backend/tests/test_gemini_client.py` (new, 7 tests).
- **Architectural impact:** Establishes the hardened AI layer that 1.3/1.5 build on.
- **Validation:** 54 backend tests (47 + 7 new) + 30 frontend tests passing. No API contract changed.
