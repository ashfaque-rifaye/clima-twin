# ClimaTwin Rendering Architecture — Multi-Resolution Tile Engine

Long-term foundation for scaling Chennai → Tamil Nadu → India without
changing the renderer. Supersedes the single-resolution engine
(docs/GAP-ANALYSIS.md §"map engine").

## 1. Why the previous renderer could not scale

The old pipeline fetched the **entire city dataset** (`/grid`, 900 cells) in
one request, built **one raster for the whole region**, and drew identical
layers at every zoom. Zooming rescaled the same overlay. Costs grew O(region
area); nothing unloaded; the color ramp spanned the whole dataset so dense
regions rendered as a uniform tint; and a Tamil Nadu-sized region (~40×
Chennai) would have required ~36,000 cells per request.

## 2. Architecture overview

```
Google Maps camera (zoom, bounds)
  └─ deck.gl TileLayer         ← visible XYZ tiles only; abort, LRU(320), unload
       └─ GET /tiles/{hazard}/{z}/{x}/{y}     (FastAPI)
            └─ band router (by z)
                 country → state summaries          (datasets.INDIA_STATES)
                 state   → district summaries+rivers (TN_DISTRICTS, TN_RIVERS)
                 city    → calibrated lattice slice  (live Google anchors)
                 block   → 100 m downscale per tile  (derived, deterministic)
                 street  → 100 m + civic assets      (intervention domain)
```

The renderer knows nothing about regions — only tiles. Scaling to India =
adding rows to the coarse datasets and lattices for new cities; the engine,
the tile API and the client are untouched.

## 3. Tile hierarchy (zoom bands)

| Band | Zoom | Dataset (resolution) | Rendered as |
|---|---|---|---|
| country | 4–6 | state severity indices | graduated symbols + labels; **no hotspots, no cells** |
| state | 7–9 | district indices + major rivers | graduated symbols, river paths |
| city | 10–12 | calibrated analysis lattice (live Weather/Elevation/AQ anchors over the urban-form model) | per-tile smooth raster |
| block | 13–15 | 100 m cells derived per tile + real civic assets | higher-resolution raster + asset markers |
| street | 16+ | 100 m cells + assets + planned interventions | intervention-simulation domain |

## 4. Spatial indexing

- **City lattice**: regular grid → a tile maps to a *lattice index range*
  via bisect (O(log n) + O(cells in tile)); no scans, no R-tree needed at
  this scale. Tiles carry a **1-cell margin** so client-side interpolation is
  seamless across tile seams.
- **Block cells**: derived on demand from the parent lattice —
  `bilinear(parent) + coordinate-hashed texture` — deterministic, so the same
  cell has the same value on every tile that includes it (verified by test).
- **Coarse bands**: point-in-bbox filters over tiny curated datasets.
- Adding a second city = registering another lattice; the tile router
  already clips to each lattice's extent.

## 5. What each climate layer shows per band

- **Heat** — country/state: severity indices. City and below: **anomaly
  rendering** — rank value minus regional median through a diverging ramp
  with a transparent dead-zone at the median. Only genuine hot/cool anomalies
  get pixels; the city is never uniformly tinted. Localized gaussian
  interpolation per tile.
- **Flood** — country/state: susceptibility indices + major rivers (Kaveri,
  Palar, Vaigai, Thamirabarani). City+: elevation-driven depth raster,
  glowing real channels (Cooum/Adyar/Buckingham) with downstream flow
  arrows, detention/pumping infrastructure.
- **Air** — country/state: AQI gradients. City+: dispersion raster +
  sea-breeze-advected particle transport.
- **Green** — country/state: vegetation indices. City+: real park/wetland
  polygons, corridor links, fragmentation flags (no raster wash).
- **Annotations gate by zoom**: hotspots/channels/parks/particles ≥ z10;
  civic assets arrive in block tiles (z13+); planned intervention placements
  ≥ z15 around the selected site.

## 6. Caching

| Layer | Cache | TTL / eviction |
|---|---|---|
| Live Google anchors (Weather/Elevation/AQ) | server, per hazard | 30 min (+2-min negative cache) |
| Calibrated lattice | server, per (hazard, epoch) | rotates with anchor epoch |
| Tile responses | server dict LRU 512, keyed (hazard, z, x, y, epoch) | epoch rotation + size cap |
| Tiles client-side | deck.gl TileLayer LRU 320, aborts off-screen fetches | eviction on pan/zoom |
| Per-tile rasters | built once in `getTileData`, cached with the tile | with tile |
| `/point` lookups | server 10 min | TTL |

## 7. Performance

- Only visible tiles are fetched (max 8 concurrent), off-screen requests
  abort, evicted tiles free their raster canvases.
- Rasterization is per-tile (160² canvas, ~2 ms) instead of one giant bitmap.
- Expensive layers are precomputed/cached server-side; the 100 m downscale
  is derived once per tile per epoch and then served from LRU.
- Whole-city fetches remain only for air-particle seeding (one cached call).
- All geometry is geographic units with pixel clamps for legibility only.

## 8. Data organization & honest labelling

```
backend/app/datasets.py   India states → TN districts → rivers → civic assets
backend/app/data.py       Chennai urban-form lattice (30×30)
backend/app/realtime.py   live Google anchors (calibration)
backend/app/routers/tiles.py  band router + spatial index + caches
```

Coarse-band indices are curated regional values reflecting published macro
patterns (IMD heat zones, CWC flood basins, CPCB AQI, FSI green cover) and
are labelled `source: "curated-regional-v0"`; city-band tiles carry
`live+model` or `synthetic` exactly as measured. The intended upgrade path —
build-time Earth Engine/BigQuery exports replacing the curated tables — slots
in behind the same tile API without touching the renderer.
