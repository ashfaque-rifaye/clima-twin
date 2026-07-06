// Per-hazard analytical layers over Google Maps.
//
// Design contract (docs/GAP-ANALYSIS.md + redesign brief):
// - every element represents a real phenomenon (field raster = interpolated
//   live measurements; paths = real rivers/canals; polygons = real parks;
//   markers = equity-weighted hotspots; particles = wind-advected pollution)
// - the basemap always reads through (alpha-capped raster, thin geometry)
// - all geometry is geographic (meters/degrees) so zoom adds detail, never
//   repetition; pixel clamps exist only to keep annotations legible.
import type { Layer } from "@deck.gl/core";
import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer, IconLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { HAZARD_META, type HazardId } from "../hazards/hazardMeta";
import { getTile, type Hotspot, type TileResp } from "../../services/api";
import { buildTileRaster, type FieldImage } from "./field";
import {
  FRAGMENTATION_POINTS, GREEN_AREAS, GREEN_CORRIDORS, SEA_BREEZE, WATERWAYS, type LngLat,
} from "./geo";

type RGBA = [number, number, number, number];

/* ---------------- real flood-control infrastructure ---------------- */
const INFRA_NODES = [
  { name: "Retteri detention", metric: "250 ML", lat: 13.115, lng: 80.218, status: "ok" as const },
  { name: "Velachery basin", metric: "backflow relief", lat: 12.979, lng: 80.221, status: "alert" as const },
  { name: "Adyar pumping", metric: "monitored", lat: 13.007, lng: 80.255, status: "info" as const },
  { name: "Porur detention", metric: "180 ML", lat: 13.037, lng: 80.158, status: "ok" as const },
];
const NODE_COLOR: Record<string, RGBA> = { ok: [52, 211, 153, 240], alert: [239, 68, 68, 240], info: [56, 189, 248, 240] };

/* ---------------- svg mask icons (tinted via getColor) ---------------- */
const svg = (inner: string) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'>${inner}</svg>`);
const ARROW = svg(`<path d='M3 12 H16 M16 12 L11 7 M16 12 L11 17' stroke='white' stroke-width='2.4' fill='none' stroke-linecap='round' stroke-linejoin='round'/>`);
const WARN = svg(`<path d='M12 3 L21 20 H3 Z' fill='white'/><rect x='11' y='9' width='2' height='6' fill='black'/><rect x='11' y='16' width='2' height='2' fill='black'/>`);
const DROP = svg(`<path d='M12 3 C12 3 6 11 6 15 a6 6 0 0 0 12 0 C18 11 12 3 12 3 Z' fill='white'/>`);

/* ---------------- geometry helpers ---------------- */
function sampleAlong(path: LngLat[], frac: number): { lng: number; lat: number; angle: number } {
  const segLen: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    segLen.push(l);
    total += l;
  }
  let target = (((frac % 1) + 1) % 1) * total;
  for (let i = 0; i < segLen.length; i++) {
    if (target <= segLen[i] || i === segLen.length - 1) {
      const t = segLen[i] ? target / segLen[i] : 0;
      const a = path[i], b = path[i + 1];
      const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      return { lng: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t, angle };
    }
    target -= segLen[i];
  }
  const last = path[path.length - 1];
  return { lng: last[0], lat: last[1], angle: 0 };
}

const centroid = (poly: LngLat[]): LngLat => [
  poly.reduce((s, p) => s + p[0], 0) / poly.length,
  poly.reduce((s, p) => s + p[1], 0) / poly.length,
];

// pollution ramp for airborne particles (green → amber → red → purple)
function aqiRamp(t: number): RGBA {
  const stops: [number, RGBA][] = [
    [0, [80, 220, 150, 235]], [0.4, [246, 196, 83, 240]], [0.7, [234, 67, 53, 245]], [1, [161, 66, 244, 245]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [p0, c0] = stops[i - 1], [p1, c1] = stops[i];
      const k = (t - p0) / (p1 - p0 || 1);
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k, 240] as RGBA;
    }
  }
  return stops[stops.length - 1][1];
}

/** A pollution particle seed: spawn point + local intensity (0..1). */
export interface AirSeed { lng: number; lat: number; w: number; phase: number }

export interface LayerInput {
  hazard: HazardId;
  zoom: number; // controls which bands/annotations exist at all
  hotspots: Hotspot[];
  airSeeds: AirSeed[];
  selected: { lat: number; lng: number } | null;
  time: number; // 0..1 loop driving particle transport + the cooling ripple
  ripple?: boolean;
  plannedCount?: number; // interventions placed in the simulator (street band)
}

/* ---------------- multi-resolution tile layer ---------------- */

type TileContent = TileResp & { raster: FieldImage | null };

const INDIA_EXTENT: [number, number, number, number] = [68, 6, 98, 37];

/**
 * The core of the multi-resolution engine: one TileLayer per hazard.
 * deck.gl fetches only visible XYZ tiles, aborts off-screen requests,
 * caches ~320 tiles and unloads evictions; the server picks the dataset
 * band by zoom. Rasterization happens once per tile inside getTileData.
 */
export function makeTileLayer(hazard: HazardId): Layer {
  const meta = HAZARD_META[hazard];
  const [r, g, b] = meta.rgb;

  return new TileLayer<TileContent>({
    id: `${hazard}-tiles`,
    minZoom: 4,
    maxZoom: 16, // deeper zooms overzoom the street-band tiles
    extent: INDIA_EXTENT,
    tileSize: 256,
    maxCacheSize: 320,
    maxRequests: 8,
    async getTileData({ index, signal }) {
      const t = await getTile(hazard, index.z, index.x, index.y, signal ?? undefined);
      let raster: FieldImage | null = null;
      if (t.cells.length && t.extent) {
        raster = buildTileRaster(
          t.cells,
          t.bounds,
          t.extent,
          meta.colorRange,
          // heat = UHI anomalies · green = thresholded canopy density (NDVI
          // proxy) · flood/air = sequential exposure ramps
          hazard === "heat" ? "anomaly" : hazard === "green" ? "canopy" : "sequential",
        );
      }
      return { ...t, raster };
    },
    renderSubLayers: (props) => {
      const tile = props.data as TileContent | undefined;
      if (!tile) return null;
      const layers: Layer[] = [];
      const sid = `${props.id}-${tile.z}-${tile.x}-${tile.y}`;

      if (tile.raster) {
        layers.push(new BitmapLayer({
          id: `${sid}-raster`,
          image: tile.raster.canvas,
          bounds: tile.raster.bounds,
          pickable: false,
          opacity: 1, // alpha baked in (land mask + cap)
        }));
      }

      // country/state: aggregated summaries — graduated symbols + names
      if (tile.summaries.length) {
        const country = tile.band === "country";
        layers.push(
          new ScatterplotLayer({
            id: `${sid}-summary-halo`,
            data: tile.summaries,
            getPosition: (d) => [d.lng, d.lat],
            getRadius: (d) => (country ? 26000 + d.value * 68000 : 7000 + d.value * 20000),
            radiusUnits: "meters",
            getFillColor: (d) => [r, g, b, Math.round(28 + d.value * 92)] as RGBA,
            stroked: true,
            getLineColor: [r, g, b, 190] as RGBA,
            lineWidthMinPixels: 1,
          }),
          new TextLayer({
            id: `${sid}-summary-lbl`,
            data: tile.summaries,
            getPosition: (d) => [d.lng, d.lat],
            getText: (d) => `${d.name}\n${Math.round(d.value * 100)}`,
            getSize: country ? 12 : 11,
            getColor: [235, 244, 252, 240],
            background: true,
            getBackgroundColor: [7, 14, 20, 175],
            backgroundPadding: [4, 2],
            fontFamily: "Roboto Mono, monospace",
          }),
        );
      }

      // state band: major rivers
      if (tile.rivers.length) {
        layers.push(new PathLayer({
          id: `${sid}-rivers`,
          data: tile.rivers,
          getPath: (d) => d.path,
          getColor: [72, 199, 255, 175] as RGBA,
          getWidth: 1400,
          widthUnits: "meters",
          widthMinPixels: 1.2,
          widthMaxPixels: 4,
          capRounded: true,
          jointRounded: true,
        }));
      }

      // block/street bands: real civic assets (exposure receptors)
      if (tile.assets.length) {
        layers.push(
          new ScatterplotLayer({
            id: `${sid}-assets`,
            data: tile.assets,
            getPosition: (d) => [d.lng, d.lat],
            getRadius: 26,
            radiusUnits: "meters",
            radiusMinPixels: 2.4,
            radiusMaxPixels: 5,
            getFillColor: [235, 244, 252, 235] as RGBA,
            stroked: true,
            getLineColor: [r, g, b, 235] as RGBA,
            lineWidthMinPixels: 1.4,
          }),
          new TextLayer({
            id: `${sid}-asset-lbl`,
            data: tile.assets,
            getPosition: (d) => [d.lng, d.lat],
            getText: (d) => d.name,
            getSize: 10,
            getColor: [220, 232, 244, 235],
            getTextAnchor: "start",
            getPixelOffset: [8, 0],
            background: true,
            getBackgroundColor: [7, 14, 20, 185],
            backgroundPadding: [4, 2],
            fontFamily: "Roboto Mono, monospace",
          }),
        );
      }

      return layers;
    },
  });
}

function hotspotLayers(hazard: HazardId, hotspots: Hotspot[]): Layer[] {
  const [r, g, b] = HAZARD_META[hazard].rgb;
  return [
    // localized hotspot: soft halo + thin ring — scale with the ground, with
    // legibility clamps so they neither vanish nor balloon
    new ScatterplotLayer<Hotspot>({
      id: `${hazard}-hotspot-halo`,
      data: hotspots,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: (d) => 260 + d.priority_score * 340,
      radiusUnits: "meters",
      radiusMaxPixels: 46,
      getFillColor: [r, g, b, 46] as RGBA,
      stroked: false,
    }),
    new ScatterplotLayer<Hotspot>({
      id: `${hazard}-hotspot-ring`,
      data: hotspots,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: (d) => 120 + d.priority_score * 160,
      radiusUnits: "meters",
      radiusMinPixels: 4,
      radiusMaxPixels: 22,
      filled: true,
      getFillColor: [r, g, b, 84] as RGBA,
      stroked: true,
      getLineColor: [245, 252, 255, 220] as RGBA,
      lineWidthMinPixels: 1.4,
      lineWidthMaxPixels: 2,
      pickable: true,
    }),
    new TextLayer<Hotspot>({
      id: `${hazard}-hotspot-lbl`,
      data: hotspots.slice(0, 6),
      getPosition: (d) => [d.lng, d.lat],
      getText: (d) => `${d.name}  ${Math.round(d.priority_score * 100)}`,
      getSize: 11,
      getColor: [238, 246, 250, 235],
      getTextAnchor: "middle",
      getAlignmentBaseline: "bottom",
      getPixelOffset: [0, -14],
      background: true,
      getBackgroundColor: [7, 14, 20, 190],
      backgroundPadding: [5, 3],
      fontFamily: "Roboto Mono, monospace",
    }),
  ];
}

/** Glowing channel: wide soft pass + narrow core, widths in METERS. */
function channel(
  id: string,
  data: { name: string; path: LngLat[] }[],
  rgb: [number, number, number],
  core = 55,
  soft = 260,
): Layer[] {
  return [
    new PathLayer({
      id: `${id}-soft`,
      data,
      getPath: (d: { path: LngLat[] }) => d.path,
      getColor: [...rgb, 64] as RGBA,
      getWidth: soft,
      widthUnits: "meters",
      widthMinPixels: 3,
      widthMaxPixels: 26,
      capRounded: true,
      jointRounded: true,
    }),
    new PathLayer({
      id: `${id}-core`,
      data,
      getPath: (d: { path: LngLat[] }) => d.path,
      getColor: [...rgb, 215] as RGBA,
      getWidth: core,
      widthUnits: "meters",
      widthMinPixels: 1.4,
      widthMaxPixels: 6,
      capRounded: true,
      jointRounded: true,
    }),
  ];
}

/* ---------------- per-hazard builders ---------------- */

function floodLayers(): Layer[] {
  // real rivers/canals as glowing channels + downstream flow direction
  const layers: Layer[] = [...channel("flood-waterways", WATERWAYS, [72, 199, 255])];

  const arrows = WATERWAYS.flatMap((w, wi) =>
    [0.25, 0.5, 0.75].map((f, i) => {
      const s = sampleAlong(w.path, f);
      return { id: `${wi}-${i}`, lng: s.lng, lat: s.lat, angle: s.angle };
    }),
  );
  layers.push(
    new IconLayer<(typeof arrows)[number]>({
      id: "flood-flow-arrows",
      data: arrows,
      getPosition: (d) => [d.lng, d.lat],
      getIcon: () => ({ url: ARROW, width: 24, height: 24, mask: true }),
      getSize: 15,
      sizeUnits: "pixels",
      getAngle: (d) => d.angle,
      getColor: [160, 224, 255, 230],
    }),
    // real detention basins / pumping stations
    new ScatterplotLayer({
      id: "flood-infra-halo",
      data: INFRA_NODES,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: 330,
      radiusUnits: "meters",
      radiusMaxPixels: 34,
      getFillColor: (d) => [NODE_COLOR[d.status][0], NODE_COLOR[d.status][1], NODE_COLOR[d.status][2], 42] as RGBA,
    }),
    new IconLayer({
      id: "flood-infra",
      data: INFRA_NODES,
      getPosition: (d) => [d.lng, d.lat],
      getIcon: () => ({ url: DROP, width: 24, height: 24, mask: true }),
      getSize: 16,
      sizeUnits: "pixels",
      getColor: (d) => NODE_COLOR[d.status],
    }),
    new TextLayer({
      id: "flood-infra-lbl",
      data: INFRA_NODES,
      getPosition: (d) => [d.lng, d.lat],
      getText: (d) => `${d.name}\n${d.metric}`,
      getSize: 10,
      getColor: [220, 235, 250, 235],
      getTextAnchor: "start",
      getPixelOffset: [12, 0],
      background: true,
      getBackgroundColor: [7, 14, 20, 185],
      backgroundPadding: [5, 3],
      fontFamily: "Roboto Mono, monospace",
    }),
  );
  return layers;
}

function airLayers(airSeeds: AirSeed[], time: number): Layer[] {
  if (!airSeeds.length) return [];
  // wind-advected transport: plumes spawn where pollution is high, drift
  // inland with the sea breeze at intensity-dependent speed, meander gently
  // (curl) and diffuse as they age — subtle, never strobing
  const TRAVEL = 0.045; // ≈ 5 km drift per cycle
  // unit vector perpendicular to the breeze, for cross-wind meander
  const PERP = { dLng: -SEA_BREEZE.dLat, dLat: SEA_BREEZE.dLng };
  const particles = airSeeds.map((s) => {
    const phase = (time + s.phase) % 1;
    const drift = phase * TRAVEL * (0.5 + s.w * 0.8);
    const curl = Math.sin(phase * Math.PI * 2 + s.phase * 6.283) * 0.0032 * phase;
    const age = Math.pow(Math.sin(Math.PI * phase), 0.75); // soft in/out
    return {
      lng: s.lng + SEA_BREEZE.dLng * drift + PERP.dLng * curl,
      lat: s.lat + SEA_BREEZE.dLat * drift + PERP.dLat * curl,
      w: s.w,
      a: age,
      spread: 1 + phase * 1.6, // diffusion: plumes widen and thin as they travel
    };
  });
  return [
    new ScatterplotLayer<(typeof particles)[number]>({
      id: "air-particles-glow",
      data: particles,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: (d) => 150 * d.spread,
      radiusUnits: "meters",
      radiusMaxPixels: 7,
      getFillColor: (d) => {
        const c = aqiRamp(d.w);
        return [c[0], c[1], c[2], Math.round((38 / d.spread) * d.a)] as RGBA;
      },
      updateTriggers: { getFillColor: time, getPosition: time, getRadius: time },
    }),
    new ScatterplotLayer<(typeof particles)[number]>({
      id: "air-particles",
      data: particles,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: 55,
      radiusUnits: "meters",
      radiusMinPixels: 0.9,
      radiusMaxPixels: 2.2,
      getFillColor: (d) => {
        const c = aqiRamp(d.w);
        return [c[0], c[1], c[2], Math.round((190 / Math.sqrt(d.spread)) * d.a)] as RGBA;
      },
      updateTriggers: { getFillColor: time, getPosition: time },
    }),
  ];
}

function greenLayers(): Layer[] {
  return [
    // real parks / forests / wetlands
    new PolygonLayer({
      id: "green-areas",
      data: GREEN_AREAS,
      getPolygon: (d) => d.polygon,
      getFillColor: [52, 211, 153, 64] as RGBA,
      getLineColor: [110, 231, 183, 200] as RGBA,
      getLineWidth: 40,
      lineWidthUnits: "meters",
      lineWidthMinPixels: 1.2,
      lineWidthMaxPixels: 3,
      pickable: true,
    }),
    new TextLayer({
      id: "green-area-lbl",
      data: GREEN_AREAS.map((g) => ({ name: g.name, pos: centroid(g.polygon) })),
      getPosition: (d) => d.pos,
      getText: (d) => d.name,
      getSize: 10.5,
      getColor: [205, 250, 230, 240],
      background: true,
      getBackgroundColor: [6, 20, 14, 190],
      backgroundPadding: [5, 3],
      fontFamily: "Roboto Mono, monospace",
    }),
    // corridor links along real features, coloured by connectivity status:
    // healthy = green · fragmented = amber · missing/potential = grey
    ...GREEN_CORRIDORS.flatMap((c) => {
      const rgb: [number, number, number] =
        c.status === "healthy" ? [52, 211, 153] : c.status === "fragmented" ? [246, 196, 83] : [148, 163, 178];
      return channel(`green-corridor-${c.name}`, [c], rgb, c.status === "missing" ? 30 : 55, c.status === "missing" ? 140 : 260);
    }),
    new TextLayer({
      id: "green-corridor-status",
      data: GREEN_CORRIDORS.map((c) => {
        const mid = sampleAlong(c.path, 0.5);
        return { name: c.name, status: c.status, lng: mid.lng, lat: mid.lat };
      }),
      getPosition: (d) => [d.lng, d.lat],
      getText: (d) => `${d.name} · ${d.status}`,
      getSize: 10,
      getColor: (d) => (d.status === "healthy" ? [180, 245, 215, 240] : d.status === "fragmented" ? [250, 224, 150, 240] : [200, 210, 220, 235]),
      background: true,
      getBackgroundColor: [6, 20, 14, 190],
      backgroundPadding: [5, 3],
      fontFamily: "Roboto Mono, monospace",
    }),
    // continuity breaks + potential restoration halos
    new ScatterplotLayer({
      id: "green-restoration-halo",
      data: FRAGMENTATION_POINTS,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: 520,
      radiusUnits: "meters",
      radiusMaxPixels: 44,
      filled: false,
      stroked: true,
      getLineColor: [255, 176, 90, 150] as RGBA,
      lineWidthMinPixels: 1.4,
    }),
    new IconLayer({
      id: "green-fragmentation",
      data: FRAGMENTATION_POINTS,
      getPosition: (d) => [d.lng, d.lat],
      getIcon: () => ({ url: WARN, width: 24, height: 24, mask: true }),
      getSize: 17,
      sizeUnits: "pixels",
      getColor: [255, 138, 60, 245],
    }),
  ];
}

/* ---------------- main entry ---------------- */

// zoom gates: annotations exist only at the scales where they carry meaning
const CITY_MIN_ZOOM = 10;   // hotspots, channels, parks, particles
const STREET_MIN_ZOOM = 15; // individual planned interventions

export function buildLayers({ hazard, zoom, hotspots, airSeeds, selected, time, ripple, plannedCount = 0 }: LayerInput): Layer[] {
  const [r, g, b] = HAZARD_META[hazard].rgb;
  const layers: Layer[] = [];
  const cityScale = zoom >= CITY_MIN_ZOOM;

  // 1. hazard-specific real geometry — city scale and below only
  if (cityScale) {
    if (hazard === "flood") layers.push(...floodLayers());
    if (hazard === "air") layers.push(...airLayers(airSeeds, time));
    if (hazard === "green") layers.push(...greenLayers());
  }

  // 2. equity-weighted priority hotspots — never at national/state overview
  if (cityScale) layers.push(...hotspotLayers(hazard, hotspots));

  // 3. street band: the intervention-simulation domain — planned placements
  //    around the selected site (from the user's simulator mix)
  if (zoom >= STREET_MIN_ZOOM && selected && plannedCount > 0) {
    const n = Math.min(plannedCount, 60);
    const placements = Array.from({ length: n }, (_, i) => {
      const a = i * 2.39996; // golden-angle spiral: even, deterministic
      const rad = 0.0004 + 0.0013 * Math.sqrt(i / n);
      return { lng: selected.lng + Math.cos(a) * rad, lat: selected.lat + Math.sin(a) * rad * 0.92 };
    });
    layers.push(
      new ScatterplotLayer({
        id: "planned-interventions",
        data: placements,
        getPosition: (d) => [d.lng, d.lat],
        getRadius: 5,
        radiusUnits: "meters",
        radiusMinPixels: 2.5,
        radiusMaxPixels: 6,
        getFillColor: [110, 231, 183, 235] as RGBA,
        stroked: true,
        getLineColor: [6, 40, 26, 200] as RGBA,
        lineWidthMinPixels: 1,
      }),
      new TextLayer({
        id: "planned-interventions-lbl",
        data: [selected],
        getPosition: (d) => [d.lng, d.lat],
        getText: () => `${plannedCount} planned placements (simulation)`,
        getSize: 10.5,
        getColor: [205, 250, 230, 240],
        getPixelOffset: [0, -26],
        background: true,
        getBackgroundColor: [6, 20, 14, 195],
        backgroundPadding: [5, 3],
        fontFamily: "Roboto Mono, monospace",
      }),
    );
  }

  // 4. cooling ripple after a simulation (event-driven, meters-based)
  if (ripple && selected) {
    [0, 0.34, 0.68].forEach((off, i) => {
      const phase = (time + off) % 1;
      layers.push(
        new ScatterplotLayer({
          id: `ripple-${i}`,
          data: [selected],
          getPosition: (d) => [d.lng, d.lat],
          getRadius: 150 + phase * 950,
          radiusUnits: "meters",
          stroked: true,
          filled: false,
          getLineColor: [r, g, b, Math.round(190 * (1 - phase))] as RGBA,
          lineWidthMinPixels: 2.5,
        }),
      );
    });
  }

  // 5. selected coordinate
  if (selected) {
    layers.push(
      new ScatterplotLayer({
        id: "sel-glow",
        data: [selected],
        getPosition: (d) => [d.lng, d.lat],
        getRadius: 420,
        radiusUnits: "meters",
        radiusMaxPixels: 60,
        getFillColor: [r, g, b, 52] as RGBA,
      }),
      new ScatterplotLayer({
        id: "sel-ring",
        data: [selected],
        getPosition: (d) => [d.lng, d.lat],
        getRadius: 170,
        radiusUnits: "meters",
        radiusMinPixels: 5,
        radiusMaxPixels: 16,
        getFillColor: [r, g, b, 110] as RGBA,
        stroked: true,
        getLineColor: [255, 255, 255, 255] as RGBA,
        lineWidthMinPixels: 2.4,
      }),
    );
  }

  return layers;
}
