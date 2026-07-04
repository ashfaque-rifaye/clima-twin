# ClimaTwin — Production Gap Analysis

Senior-architect review of the post-refactor codebase (July 2026).
Each finding: **severity · status · where**. Fixed items reference the commit series
`4f411d1 → d512703 → f015d0b → 28c0ccd`.

## 1. Correctness / rendering

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1.1 | Vector map never initialised: `RenderingType.VECTOR` without a **Map ID** → raster fallback → deck.gl interleaved overlay (the entire hazard visualisation) silently never rendered | **Critical** | ✅ Fixed — `mapId` (DEMO_MAP_ID default, `VITE_GOOGLE_MAPS_MAP_ID` override) in `MapStage.tsx` |
| 1.2 | `HeatmapLayer` aggregation pass fails in deck.gl 9 **interleaved** mode (`weightsTexture not set`) → no heat field | **Critical** | ✅ Fixed — `GoogleMapsOverlay({ interleaved: false })` |
| 1.3 | Heat field rendered as a uniform red wash: SUM density aggregation over a dense grid saturates every pixel | High | ✅ Fixed — `aggregation: "MEAN"` + backend rank-normalised display weights |
| 1.4 | `/grid` regressed to 100 % synthetic data (user requirement: *real* data) | **High** | ✅ Fixed — live Google anchors (Weather / Elevation / AQ) IDW-blended over the urban-form field; `source: "live+model"` vs `"synthetic"` labels honestly |
| 1.5 | Literal `·` escape rendered as text in JSX (`MicroclimateCard`) | Low | ✅ Fixed |
| 1.6 | Cells overlay ballooned into giant blobs at zoom ≥ 12 (metre radius, no pixel cap) | Medium | ✅ Fixed — `radiusMaxPixels` |
| 1.7 | Maps JS script double-loaded when `/config` swapped the API key after mount | Medium | ✅ Fixed — env key wins; backend key only adopted when no env key |
| 1.8 | AI proposal markdown displayed raw `**` asterisks | Low | ✅ Fixed — safe markdown-lite renderer (HTML-escape first) |

## 2. Reliability

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 2.1 | No fetch timeouts anywhere in the frontend → a hung request spins forever | High | ✅ Fixed — AbortController: 15 s GET / 45 s AI POST; GETs retry once on network error or 5xx |
| 2.2 | Rapid map clicks: slower older `/point` response could overwrite the newer selection | Medium | ✅ Fixed — stale-response guards in the store |
| 2.3 | Every API failure swallowed silently (`catch {}`) — user saw stale/empty UI with no explanation | High | ✅ Fixed — `pointError` / `simError` / `propError` + inline retry buttons |
| 2.4 | Gemini call had **no timeout** — a hung call blocks a request worker indefinitely | High | ✅ Fixed — 25 s client timeout + failure logging |
| 2.5 | External-API failures invisible (bare `except: pass`) | Medium | ✅ Fixed — warning logs on every degradation path; grid outages negative-cached 2 min to prevent stampedes |
| 2.6 | Unhandled backend exception returned a raw 500 | Medium | ✅ Fixed — global handler returns JSON, logs stack trace |

## 3. Security & validation

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 3.1 | Zero input validation: any lat/lng on Earth, unbounded `count`(→ absurd simulations), unbounded question/plan payloads (token burn), free-text hazard | High | ✅ Fixed — Pydantic `Field` bounds + `Literal` hazards + payload caps → 422 |
| 3.2 | No rate limiting on a public, unauthenticated Cloud Run URL that proxies paid-tier-adjacent Google APIs + Gemini | High | ✅ Fixed — per-IP fixed-window limiter (240/min, X-Forwarded-For aware), 429 + Retry-After |
| 3.3 | No security headers | Medium | ✅ Fixed — nosniff, DENY framing, referrer + permissions policy |
| 3.4 | CORS allowed all methods | Low | ✅ Fixed — GET/POST only |
| 3.5 | `/ask` prompt-injected the entire 900-cell grid JSON per question | Medium | ✅ Fixed — compact digest (extremes + aggregates) |
| 3.6 | Browser Maps key served via `/config` | Accepted | By design — key is referrer-restricted in GCP; standard Maps-platform pattern |
| 3.7 | Auth | Deferred | Public demo by intent. `services/api.ts` has bearer-token scaffolding (`setAuthToken`) ready for an IdP |

## 4. Tests (previously **zero**)

- ✅ Backend: 34 pytest cases — validation edges, live/synthetic grid blend + anchor-gradient assertion, endpoint happy paths + no-Gemini fallbacks, rate-limiter, 500-shield. Fully mocked externals; runs offline in <1 s.
- ✅ Frontend: 19 vitest cases — format helpers (incl. XSS escaping in `mdToHtml`), densify IDW anchoring, store flows (stale-guard, error flags, scenarios, timeline) against a mocked API.
- Run: `backend/.venv/Scripts/python -m pytest backend/tests` · `cd frontend && npm test`

## 5. Performance

| # | Finding | Status |
|---|---------|--------|
| 5.1 | Map bundle (deck.gl, 724 kB) | Already code-split out of first paint (`lazy(MapStage)`); main bundle 215 kB |
| 5.2 | Live grid fan-out | 64 Weather + 16 AQ calls, semaphore-capped (16), cached 30 min server-side |
| 5.3 | Point lookups | Cached 10 min server-side (`realtime_point`) |
| 5.4 | Static assets | Immutable cache headers; index.html no-cache (stale-deploy fix) |

## 6. Known remaining items (ranked)

1. **Cloud Map ID with custom dark styling** — DEMO_MAP_ID works but Google labels it for development; create a styled Map ID in the `climatwin-chennai` console project and set `VITE_GOOGLE_MAPS_MAP_ID` at build time (5-min task, zero code change).
2. **Single-container rate-limit scope** — in-memory limiter resets per instance; fine at Cloud Run max-instances=1 (current), swap for a shared store if scaled out.
3. **Earth Engine LST layer** — the "true satellite thermal" upgrade; blocked on EE project registration (user action, ~2 min).
4. **PWA/mobile pass** — layout is responsive but uninstalled as PWA; Day 6 polish item.
5. **CI** — tests exist but no pipeline runs them on push (GitHub Actions free tier would do; repo currently has no remote).

## 7. Verification evidence

- Local end-to-end (visible Chrome, real GPU): dark vector map renders; heat/flood/air layers each show correct hazard-specific visuals; click → exact-coordinate reverse-geocoded live HUD; AI recommend → simulate (−6 °C, people, ₹, ROI) → markdown proposal → ask, all live against Gemini + Weather + AQ + Elevation + Geocoding.
- `/grid` verified serving `live+model` for heat/flood/air with rank-spread weights.
- Note for future automated testing: WebGL maps **cannot paint in a hidden window** (rAF suspended — this produced the historical "blank map" false alarms). Verify with a visible browser window.
