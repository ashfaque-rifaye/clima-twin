# Budget plan — target ≈ $0 (ceiling well under $5)

Real 2026 free-tier pricing. The whole demo is designed to cost nothing.

| Service | Free allowance (2026) | Our demo usage | Est. cost |
|---|---|---|---|
| **Gemini API** (AI Studio) — Gemini **Flash** | 1,500 req/day, 1M TPM ($0; Pro is paid, unused) | a few hundred calls/day | **$0** |
| **BigQuery** (+ BigQuery ML) | 1 TB queries + 10 GB storage/mo; first 10 GB CREATE MODEL free | tiny grid (<1 GB) | **$0** |
| **Earth Engine** (noncommercial) | Monthly EECU compute quota (Community tier) | one-time Chennai exports → BigQuery | **$0** |
| **Cloud Run** | ~2M req + 360k GB-s/mo free | demo traffic | **$0** |
| **Maps JS API** (2D + heatmap, Essentials) | 10,000 calls/SKU/mo | well under | **$0** |
| **Air Quality API** | 10,000 calls/mo | per-point only | **$0** |
| **Pollen API** | 5,000 calls/mo | per-point only | **$0** |
| **Photorealistic 3D Tiles** (optional) | 1,000 sessions/mo, then $6 CPM | ≤ few hundred loads | **$0** *(watch cap)* |
| **Imagen / image gen** | paid | avoided — pre-generated | **$0** |
| **TOTAL** | | | **≈ $0** |

## Hard rules
1. **Gemini Flash only** (2.5/3 Flash, Flash-Lite). **Never Pro** (paid since Apr 2026).
2. **No paid Vertex AI.** Gemini via AI Studio API key (free tier). Cooling model via **BigQuery ML / local scikit-learn**.
3. **Before/after images pre-generated**, not live Imagen.
4. **3D Tiles gated behind a button**, kept under 1,000 sessions/month.
5. **Day 0 billing guardrails:** GCP budget alert + cap; Maps key restricted to domain + only enabled APIs; Gemini key on free tier.

## Only possible spend triggers (both avoidable)
- 3D Tiles beyond 1,000 monthly sessions.
- Accidentally calling a Gemini **Pro** model.

## Accounts
- Primary: non-trial billing account on `ashfaque.rifaye94@gmail.com`.
- Buffer: $5 trial credit (should remain untouched for the demo).
