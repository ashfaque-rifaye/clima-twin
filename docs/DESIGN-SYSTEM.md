# ClimaTwin — Design System

Extracted verbatim from the established mockups in `Design Mockup Request/*.dc.html`
(`ClimaTwin.dc.html` is the primary reference; `ClimaTwin v1 (GIS).dc.html` and
`Canvas.dc.html` are supporting). **This is the single source of visual truth.**
Do not invent new tokens — reproduce these.

> Note: the mockups prototype the map with Leaflet + SVG heat overlays. The
> production app keeps **Google Maps** as the basemap (per project brief) and
> renders the same visual language as overlays on top of it.

## 1. Typography
| Role | Font | Notes |
|------|------|-------|
| UI / body | **Manrope** | weights 500, 600, 700, 800 |
| Micro-labels, coords, metric values | **Roboto Mono** | uppercase, letter-spacing 1.3–1.8px |

Scale: brand 16/800 (-0.3px) · panel hero title 17/800 · section label mono 10/1.8ls
uppercase · coord mono 11 · micro mono 9–9.5 · body 13–13.5 · big metric 34–42/900.

## 2. Color tokens
```
/* brand */
--ct-blue:        #1a73e8;   /* primary action, links, active */
--ct-green:       #34a853;   /* secondary / logo gradient end */
--ct-brand-grad:  linear-gradient(135deg,#1a73e8,#34a853);

/* hazards */
--ct-heat:        #ea4335;   /* heat hero + heat layer */
--ct-flood:       #1a73e8;   /* flood layer (blue) */
--ct-air:         #12b5cb;   /* air layer (cyan) */

/* status */
--ct-alert:       #d93025;   /* blind-spot / priority chip bg */
--ct-alert-ink:   #c1271f;   /* priority text on #fde8e6 */
--ct-good:        #1e8e3e;   /* after-intervention / improvement */
--ct-node-alert:  #ef4444;  --ct-node-ok:#34d399;  --ct-node-info:#38bdf8;

/* surfaces — light chrome */
--ct-bg:          #0b1622;   /* app shell behind everything */
--ct-chrome:      #ffffff;   /* top bar */
--ct-sidebar:     #f6f8fa;   /* right rail */
--ct-card:        #ffffff;   /* sidebar cards */
--ct-track:       #eef1f4;   /* progress/bar track */
--ct-chip:        #f1f3f4;   /* search pill / toggle group */

/* surfaces — dark AI card */
--ct-ink-card:    linear-gradient(160deg,#0f1d2e,#15273b);
--ct-ink-border:  #1d3047;

/* borders */
--ct-border:      #e3e7eb;   --ct-border-2:#e6eaee;

/* text — on light */
--ct-ink:         #1f2733;   --ct-ink-2:#3c4858;   --ct-ink-3:#5f6b7a;
--ct-muted:       #8a96a6;   --ct-muted-2:#9aa6b4; --ct-faint:#b3bcc7;

/* text — on dark glass */
--ct-on-dark:     #ffffff;   --ct-on-dark-2:#9fb0c2; --ct-on-dark-3:#cbd4de;

/* glass */
--ct-glass:       rgba(13,22,33,.84);   /* map overlay cards */
--ct-glass-2:     rgba(9,16,24,.93);    /* HUD tooltip */
--ct-glass-line:  rgba(255,255,255,.13);
--ct-hud-line:    rgba(120,170,230,.32);
```

## 3. Radii, shadows, blur
```
--r-sm:7px; --r:9px; --r-md:11px; --r-lg:14px; --r-xl:16px; --r-pill:20px;
--sh-hair:  0 1px 2px rgba(16,24,40,.04);   /* white cards, header */
--sh-float: 0 4px 16px rgba(16,24,40,.16);  /* white floating (timeline) */
--sh-glass: 0 6px 22px rgba(0,0,0,.34);     /* dark glass overlay card */
--sh-hud:   0 8px 26px rgba(0,0,0,.5);      /* HUD tooltip */
--sh-btn:   0 2px 6px rgba(26,115,232,.3);  /* blue buttons */
--blur: blur(10px);  --blur-sm: blur(8px);
```

## 4. Layout (fixed, flex column)
```
app        position:fixed inset:0 flex-col bg:#0b1622
├─ header  58px, white, border-bottom #e3e7eb, sh-hair, z:30
│          [logo+brand+mono subtitle] [search pill center] [hazard toggle] [Share]
└─ body    flex:1 flex-row min-height:0
   ├─ map  flex:1 (Google Maps dark) with absolute overlays:
   │        · selected-zone card  TL (16,16) w208 dark-glass r14
   │        · legend + gradient bar  TR (16,16) dark-glass r12
   │        · basemap toggle  BL (16, bottom:86) dark-glass r11
   │        · zoom controls   BR (16, bottom:86) WHITE r10
   │        · scenario timeline  bottom (16,16,16) WHITE glass rgba(255,255,255,.96) r14
   │        · HUD tooltip (JS-positioned) dark-glass-2 r11
   │        · flood stats chip  BL (16, bottom:130) dark-glass r11
   └─ aside 384px, bg #f6f8fa, border-left #e3e7eb, padding16, gap14, scroll
            1. Microclimate Analysis  (white r16, hero metric + delta chip)
            2. Vulnerability Index     (white r16, PRIORITY chip, Data Blind Spot)
            3. Simulate Intervention   (white r16, palette + before/after bars)
            4. AI Proposal · Gemini    (dark ink-card r16, Export + Regenerate)
```

## 5. Components
- **Header logo:** 30px, r9, `--ct-brand-grad`, `--sh-btn`; inner white ring mark.
- **Search pill:** `--ct-chip` bg, `--ct-border`, r-pill(20), h38, w min(360px,34vw); location 13.5 `--ct-ink-2` + mono coord 11 `--ct-muted-2`.
- **Hazard toggle:** group `--ct-chip`/`--ct-border` r12 p4; item h30 r9 Manrope 12.5/700 + 8px color dot; active = filled with hazard color.
- **Primary button:** h38 r10 `--ct-blue` white 13/700 `--sh-btn`.
- **Section label:** Roboto Mono 10/1.8ls uppercase `--ct-muted` 600.
- **White card:** `--ct-card`, `1px solid --ct-border-2`, r16, `--sh-hair`.
- **Dark-glass overlay card:** `--ct-glass` + `--blur` + `1px solid --ct-glass-line` + r14 + `--sh-glass`.
- **Chips:** PRIORITY = `#fde8e6`/`--ct-alert-ink` r6; DATA BLIND SPOT = `--ct-alert` white mono 9.5 r7 + blinking dot.
- **Before/after bars:** h8 r6 track `--ct-track`; before grey, after `--ct-good` 600.
- **Range slider:** track h4 r4 `#d6dde4`; thumb 16px circle `--ct-blue` 2px white border.
- **Scenario timeline:** white glass r14; 34px blue play button r9; "Scenario · diurnal" mono 9/1.4ls + hour mono 15/600.

## 6. Motion
```
@keyframes ctPulse { 0%{transform:translate(-50%,-50%) scale(.7);opacity:.85}
                     70%{transform:translate(-50%,-50%) scale(2.4);opacity:0} 100%{opacity:0} }
@keyframes ctBlink { 0%,100%{opacity:1} 50%{opacity:.35} }
```
`ctPulse` = map hotspot ping · `ctBlink` = live/alert dots (1.4s infinite).

## 7. Per-hazard visual identity (map overlays on Google Maps)
| Hazard | Hero metric | Accent | Layer treatment |
|--------|-------------|--------|-----------------|
| Heat | Land Surface Temp °C (feels-like) | `--ct-heat` #ea4335 | thermal gradient field, urban-heat-island bloom, hotspot interpolation + `ctPulse` |
| Flood | Flood risk / depth | `--ct-flood` #1a73e8 | accumulation field, runoff/flow arrows, drainage + detention/reservoir infra nodes (status-colored) |
| Air | AQI | `--ct-air` #12b5cb | AQI gradient, pollution dispersion, wind vectors / particle drift |

Never use plain colored circles as the primary layer — use continuous fields +
directional/structural elements as above.
