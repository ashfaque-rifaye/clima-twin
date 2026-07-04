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
import { BitmapLayer, IconLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { HAZARD_META, type HazardId } from "../hazards/hazardMeta";
import type { Hotspot } from "../../services/api";
import type { FieldImage } from "./field";
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
  field: FieldImage | null;
  hotspots: Hotspot[];
  airSeeds: AirSeed[];
  selected: { lat: number; lng: number } | null;
  time: number; // 0..1 loop driving particle transport + the cooling ripple
  ripple?: boolean;
}

/* ---------------- shared sub-builders ---------------- */

function fieldLayer(hazard: HazardId, field: FieldImage | null): Layer[] {
  if (!field) return [];
  return [
    new BitmapLayer({
      id: `${hazard}-field-raster`,
      image: field.canvas,
      bounds: field.bounds,
      pickable: false,
      opacity: 1, // alpha is baked into the raster (land-masked, capped)
    }),
  ];
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
function channel(id: string, data: { name: string; path: LngLat[] }[], rgb: [number, number, number]): Layer[] {
  return [
    new PathLayer({
      id: `${id}-soft`,
      data,
      getPath: (d: { path: LngLat[] }) => d.path,
      getColor: [...rgb, 64] as RGBA,
      getWidth: 260,
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
      getWidth: 55,
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
  // wind-advected transport: particles spawn where pollution is high and
  // drift inland with the afternoon sea breeze, fading as they disperse
  const TRAVEL = 0.05; // ≈ 5.5 km drift per cycle
  const particles = airSeeds.map((s) => {
    const phase = (time + s.phase) % 1;
    const drift = phase * TRAVEL * (0.55 + s.w * 0.75);
    return {
      lng: s.lng + SEA_BREEZE.dLng * drift,
      lat: s.lat + SEA_BREEZE.dLat * drift,
      w: s.w,
      a: Math.sin(Math.PI * phase), // fade in → out over the cycle
    };
  });
  return [
    new ScatterplotLayer<(typeof particles)[number]>({
      id: "air-particles-glow",
      data: particles,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: 210,
      radiusUnits: "meters",
      radiusMaxPixels: 9,
      getFillColor: (d) => {
        const c = aqiRamp(d.w);
        return [c[0], c[1], c[2], Math.round(52 * d.a)] as RGBA;
      },
      updateTriggers: { getFillColor: time, getPosition: time },
    }),
    new ScatterplotLayer<(typeof particles)[number]>({
      id: "air-particles",
      data: particles,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: 62,
      radiusUnits: "meters",
      radiusMinPixels: 1,
      radiusMaxPixels: 2.6,
      getFillColor: (d) => {
        const c = aqiRamp(d.w);
        return [c[0], c[1], c[2], Math.round(215 * d.a)] as RGBA;
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
    // corridor links along real features
    ...channel("green-corridors", GREEN_CORRIDORS, [52, 211, 153]),
    // flagged continuity breaks
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

export function buildLayers({ hazard, field, hotspots, airSeeds, selected, time, ripple }: LayerInput): Layer[] {
  const [r, g, b] = HAZARD_META[hazard].rgb;
  const layers: Layer[] = [];

  // 1. continuous measured field (LST / flood exposure / AQI), land-masked
  if (hazard !== "green") layers.push(...fieldLayer(hazard, field));

  // 2. hazard-specific real geometry
  if (hazard === "flood") layers.push(...floodLayers());
  if (hazard === "air") layers.push(...airLayers(airSeeds, time));
  if (hazard === "green") layers.push(...greenLayers());

  // 3. equity-weighted priority hotspots (from /hotspots)
  layers.push(...hotspotLayers(hazard, hotspots));

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
