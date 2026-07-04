// Georeferenced raster field engine.
//
// Takes the /grid samples (live Google Weather / Elevation / AQ anchors
// blended over the urban-form model) and renders one smooth, land-masked,
// semi-transparent raster per hazard. The raster is drawn with a deck.gl
// BitmapLayer pinned to geographic bounds, so zooming magnifies the SAME
// continuous surface — no screen-space blobs, no lattice artifacts, no
// repetition. The basemap always reads through (alpha-capped ramp).
import type { GridPoint } from "../../services/api";
import { coastLngAt } from "./geo";

export type RGBA = [number, number, number, number];

/** [west, south, east, north] — BitmapLayer bounds order. */
export type Bounds = [number, number, number, number];

export interface FieldImage {
  canvas: HTMLCanvasElement;
  bounds: Bounds;
}

// Raster resolution: ~100 m/px over greater Chennai. High enough that street
// zoom shows a smooth gradient, low enough to rebuild in a few ms.
const RASTER_W = 224;
const RASTER_H = 416;

// The overlay must never hide the geography underneath.
const MAX_ALPHA = 0.62;

// soft falloff widths (degrees): ~700 m at the shoreline, ~2 km at bbox edges
const COAST_FADE = 0.0065;
const EDGE_FADE = 0.02;

/** Linear colour lookup across evenly spaced ramp stops (with alpha). */
export function rampColor(v: number, ramp: RGBA[] | number[][]): RGBA {
  const n = ramp.length;
  const t = Math.min(1, Math.max(0, v)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(t));
  const f = t - i;
  const a = ramp[i], b = ramp[i + 1];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
    (a[3] ?? 255) + ((b[3] ?? 255) - (a[3] ?? 255)) * f,
  ];
}

export interface SampleGrid {
  lats: number[]; // ascending
  lngs: number[]; // ascending
  values: Float32Array; // row-major [latIdx * lngs.length + lngIdx]
}

/** Arrange /grid samples into a regular lattice; null if irregular. */
export function toSampleGrid(points: GridPoint[]): SampleGrid | null {
  const lats = [...new Set(points.map((p) => p.lat))].sort((x, y) => x - y);
  const lngs = [...new Set(points.map((p) => p.lng))].sort((x, y) => x - y);
  if (lats.length < 2 || lngs.length < 2 || lats.length * lngs.length !== points.length) return null;
  const li = new Map(lats.map((v, i) => [v, i]));
  const gi = new Map(lngs.map((v, i) => [v, i]));
  const values = new Float32Array(lats.length * lngs.length);
  for (const p of points) values[li.get(p.lat)! * lngs.length + gi.get(p.lng)!] = p.weight;
  return { lats, lngs, values };
}

/** Bilinear sample of the regular lattice at (lat, lng). */
export function sampleBilinear(g: SampleGrid, lat: number, lng: number): number {
  const nLat = g.lats.length, nLng = g.lngs.length;
  const fy = ((lat - g.lats[0]) / (g.lats[nLat - 1] - g.lats[0])) * (nLat - 1);
  const fx = ((lng - g.lngs[0]) / (g.lngs[nLng - 1] - g.lngs[0])) * (nLng - 1);
  const y = Math.min(nLat - 2, Math.max(0, Math.floor(fy)));
  const x = Math.min(nLng - 2, Math.max(0, Math.floor(fx)));
  const ty = Math.min(1, Math.max(0, fy - y));
  const tx = Math.min(1, Math.max(0, fx - x));
  const v00 = g.values[y * nLng + x], v01 = g.values[y * nLng + x + 1];
  const v10 = g.values[(y + 1) * nLng + x], v11 = g.values[(y + 1) * nLng + x + 1];
  return (v00 * (1 - tx) + v01 * tx) * (1 - ty) + (v10 * (1 - tx) + v11 * tx) * ty;
}

/** Fallback for irregular samples: inverse-distance-squared interpolation. */
export function sampleIDW(points: GridPoint[], lat: number, lng: number): number {
  let num = 0, den = 0;
  for (const p of points) {
    const d2 = (lat - p.lat) ** 2 + (lng - p.lng) ** 2;
    if (d2 < 1e-9) return p.weight;
    const w = 1 / d2;
    num += w * p.weight;
    den += w;
  }
  return den ? num / den : 0;
}

/**
 * Combined land/edge mask at (lat, lng): 1 inland, 0 over the sea, with a
 * soft shoreline falloff; also fades near the west/north/south data borders
 * so the field never ends in a hard rectangle.
 */
export function maskAt(lat: number, lng: number, b: Bounds): number {
  const coast = (coastLngAt(lat) - lng) / COAST_FADE; // >0 means inland
  const west = (lng - b[0]) / EDGE_FADE;
  const south = (lat - b[1]) / EDGE_FADE;
  const north = (b[3] - lat) / EDGE_FADE;
  return clamp01(coast) * clamp01(west) * clamp01(south) * clamp01(north);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Separable 5-tap gaussian blur (two passes) on a value buffer. */
export function blur(buf: Float32Array, w: number, h: number): Float32Array {
  const k = [1, 4, 6, 4, 1];
  const tmp = new Float32Array(buf.length);
  const out = new Float32Array(buf.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, ws = 0;
      for (let i = -2; i <= 2; i++) {
        const xx = x + i;
        if (xx < 0 || xx >= w) continue;
        s += buf[y * w + xx] * k[i + 2];
        ws += k[i + 2];
      }
      tmp[y * w + x] = s / ws;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, ws = 0;
      for (let i = -2; i <= 2; i++) {
        const yy = y + i;
        if (yy < 0 || yy >= h) continue;
        s += tmp[yy * w + x] * k[i + 2];
        ws += k[i + 2];
      }
      out[y * w + x] = s / ws;
    }
  }
  return out;
}

/** Build the hazard raster. Returns null without a DOM (tests) or data. */
export function buildField(points: GridPoint[], ramp: RGBA[] | number[][]): FieldImage | null {
  if (!points.length || typeof document === "undefined") return null;

  const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
  const bounds: Bounds = [
    Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats),
  ];
  const [west, south, east, north] = bounds;
  if (east - west < 1e-6 || north - south < 1e-6) return null;

  const grid = toSampleGrid(points);

  // 1. interpolate onto the raster
  let values: Float32Array = new Float32Array(RASTER_W * RASTER_H);
  for (let y = 0; y < RASTER_H; y++) {
    const lat = north - ((y + 0.5) / RASTER_H) * (north - south);
    for (let x = 0; x < RASTER_W; x++) {
      const lng = west + ((x + 0.5) / RASTER_W) * (east - west);
      values[y * RASTER_W + x] = grid
        ? sampleBilinear(grid, lat, lng)
        : sampleIDW(points, lat, lng);
    }
  }

  // 2. gaussian smoothing (kills any remaining lattice creases)
  values = blur(values, RASTER_W, RASTER_H);

  // 3. colorize + mask
  const canvas = document.createElement("canvas");
  canvas.width = RASTER_W;
  canvas.height = RASTER_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(RASTER_W, RASTER_H);
  for (let y = 0; y < RASTER_H; y++) {
    const lat = north - ((y + 0.5) / RASTER_H) * (north - south);
    for (let x = 0; x < RASTER_W; x++) {
      const lng = west + ((x + 0.5) / RASTER_W) * (east - west);
      const [r, g, b, a] = rampColor(values[y * RASTER_W + x], ramp);
      const o = (y * RASTER_W + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = Math.round(a * MAX_ALPHA * maskAt(lat, lng, bounds));
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, bounds };
}
