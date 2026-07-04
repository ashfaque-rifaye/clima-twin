// Per-hazard deck.gl visualisation on top of Google Maps.
// Heat  = thermal field · Flood = neon inundation + flow arrows + rivers + basins
// Air   = dispersion field + animated particle flux · Green = corridor network.
// Neon glow is faked with a soft wide pass + a bright core pass (no shader bloom).
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { Layer } from "@deck.gl/core";
import { IconLayer, PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { HAZARD_META, type HazardId } from "../hazards/hazardMeta";
import type { GridPoint, Hotspot } from "../../services/api";
import type { Cell } from "./densify";

type LngLat = [number, number];
type RGBA = [number, number, number, number];

/* ---------------- accurate locality anchors (real Chennai) ---------------- */
const LOCALITIES: { name: string; lat: number; lng: number }[] = [
  { name: "T. Nagar", lat: 13.040, lng: 80.233 }, { name: "Anna Nagar", lat: 13.085, lng: 80.210 },
  { name: "Adyar", lat: 13.006, lng: 80.257 }, { name: "Velachery", lat: 12.979, lng: 80.221 },
  { name: "Guindy", lat: 13.010, lng: 80.212 }, { name: "Mylapore", lat: 13.033, lng: 80.268 },
  { name: "Egmore", lat: 13.073, lng: 80.261 }, { name: "Nungambakkam", lat: 13.060, lng: 80.242 },
  { name: "Kodambakkam", lat: 13.052, lng: 80.227 }, { name: "Chromepet", lat: 12.951, lng: 80.140 },
  { name: "Tambaram", lat: 12.925, lng: 80.127 }, { name: "Sholinganallur", lat: 12.901, lng: 80.227 },
  { name: "Perungudi", lat: 12.965, lng: 80.242 }, { name: "Porur", lat: 13.037, lng: 80.158 },
  { name: "Ambattur", lat: 13.098, lng: 80.161 }, { name: "Vadapalani", lat: 13.050, lng: 80.212 },
  { name: "Kilpauk", lat: 13.078, lng: 80.241 }, { name: "Perambur", lat: 13.108, lng: 80.233 },
  { name: "Royapuram", lat: 13.113, lng: 80.294 }, { name: "Triplicane", lat: 13.055, lng: 80.278 },
  { name: "Besant Nagar", lat: 12.999, lng: 80.267 }, { name: "Thiruvanmiyur", lat: 12.983, lng: 80.259 },
  { name: "Pallikaranai", lat: 12.936, lng: 80.212 }, { name: "Saidapet", lat: 13.021, lng: 80.223 },
  { name: "Chennai Central", lat: 13.082, lng: 80.275 }, { name: "Washermanpet", lat: 13.117, lng: 80.283 },
  { name: "Manali", lat: 13.166, lng: 80.260 }, { name: "Ennore", lat: 13.213, lng: 80.324 },
];

/* ---------------- hazard corridors ---------------- */
const PATHS: Record<HazardId, { label: string; path: LngLat[] }[]> = {
  heat: [
    { label: "Anna Salai heat canyon", path: [[80.270, 13.082], [80.258, 13.060], [80.244, 13.035], [80.222, 13.010]] },
    { label: "T. Nagar market spine", path: [[80.214, 13.058], [80.225, 13.047], [80.236, 13.038], [80.248, 13.028]] },
    { label: "OMR exposure band", path: [[80.226, 12.890], [80.228, 12.930], [80.231, 12.975], [80.245, 13.020]] },
  ],
  flood: [
    { label: "Cooum corridor", path: [[80.150, 13.070], [80.182, 13.068], [80.214, 13.066], [80.248, 13.070], [80.292, 13.078]] },
    { label: "Adyar basin", path: [[80.150, 13.006], [80.186, 13.000], [80.220, 13.002], [80.254, 13.010], [80.300, 13.016]] },
    { label: "Buckingham Canal", path: [[80.282, 12.890], [80.284, 12.950], [80.287, 13.015], [80.291, 13.080], [80.295, 13.145]] },
  ],
  air: [
    { label: "Port freight NO2", path: [[80.296, 13.114], [80.284, 13.095], [80.270, 13.082], [80.248, 13.065], [80.226, 13.045]] },
    { label: "Inner Ring traffic", path: [[80.162, 13.100], [80.188, 13.083], [80.220, 13.070], [80.250, 13.060], [80.278, 13.055]] },
    { label: "GST industrial belt", path: [[80.162, 13.098], [80.194, 13.070], [80.212, 13.010], [80.150, 12.950]] },
    { label: "Coast sea-breeze", path: [[80.300, 12.960], [80.288, 13.010], [80.282, 13.060], [80.286, 13.110]] },
  ],
  green: [
    { label: "Adyar green spine", path: [[80.150, 13.006], [80.190, 13.002], [80.230, 13.006], [80.257, 13.006]] },
    { label: "Coastal green edge", path: [[80.283, 12.90], [80.284, 12.98], [80.282, 13.05], [80.286, 13.11]] },
    { label: "Pallikaranai marsh link", path: [[80.212, 12.936], [80.221, 12.965], [80.221, 12.999], [80.212, 13.010]] },
    { label: "Guindy park corridor", path: [[80.212, 13.010], [80.233, 13.020], [80.242, 13.033]] },
  ],
};

/* ---------------- flood drainage / detention infrastructure ---------------- */
const INFRA_NODES = [
  { name: "Retteri detention", metric: "250 ML", lat: 13.115, lng: 80.218, status: "ok" as const },
  { name: "Velachery basin", metric: "backflow relief", lat: 12.979, lng: 80.221, status: "alert" as const },
  { name: "Adyar pumping", metric: "monitored", lat: 13.007, lng: 80.255, status: "info" as const },
  { name: "Porur detention", metric: "180 ML", lat: 13.037, lng: 80.158, status: "ok" as const },
];
const NODE_COLOR: Record<string, RGBA> = { ok: [52, 211, 153, 240], alert: [239, 68, 68, 240], info: [56, 189, 248, 240] };

/* ---------------- green corridor network ---------------- */
const GREEN_NODES = [
  { name: "Guindy National Park", lat: 13.006, lng: 80.238 }, { name: "Adyar Eco-Park", lat: 13.012, lng: 80.253 },
  { name: "Pallikaranai Marsh", lat: 12.936, lng: 80.212 }, { name: "Nanmangalam Forest", lat: 12.933, lng: 80.170 },
  { name: "Theosophical Society", lat: 13.005, lng: 80.263 }, { name: "Semmozhi Poonga", lat: 13.058, lng: 80.250 },
];
const FRAGMENTATION = [
  { lat: 13.020, lng: 80.190 }, { lat: 12.958, lng: 80.205 }, { lat: 13.070, lng: 80.230 },
];

/* ---------------- svg mask icons (tinted via getColor) ---------------- */
const svg = (inner: string) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'>${inner}</svg>`);
const ARROW = svg(`<path d='M3 12 H16 M16 12 L11 7 M16 12 L11 17' stroke='white' stroke-width='2.4' fill='none' stroke-linecap='round' stroke-linejoin='round'/>`);
const WARN = svg(`<path d='M12 3 L21 20 H3 Z' fill='white'/><rect x='11' y='9' width='2' height='6' fill='black'/><rect x='11' y='16' width='2' height='2' fill='black'/>`);
const LEAF = svg(`<path d='M6 18 C6 9 12 5 19 5 C19 13 14 19 6 18 Z' fill='white'/>`);

/* ---------------- geometry helpers ---------------- */
function sampleAlong(path: LngLat[], frac: number): { lng: number; lat: number; angle: number } {
  const segLen: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i][0] - path[i - 1][0];
    const dy = path[i][1] - path[i - 1][1];
    const l = Math.hypot(dx, dy);
    segLen.push(l); total += l;
  }
  let target = ((frac % 1) + 1) % 1 * total;
  for (let i = 0; i < segLen.length; i++) {
    if (target <= segLen[i] || i === segLen.length - 1) {
      const t = segLen[i] ? target / segLen[i] : 0;
      const a = path[i], b = path[i + 1];
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
      return { lng: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t, angle };
    }
    target -= segLen[i];
  }
  const last = path[path.length - 1];
  return { lng: last[0], lat: last[1], angle: 0 };
}

// air pollution ramp green→yellow→red→purple
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

function glowPath<T>(id: string, data: T[], getPath: (d: T) => LngLat[], rgb: [number, number, number], core = 3, soft = 12): Layer[] {
  return [
    new PathLayer<T>({ id: `${id}-soft`, data, getPath, getColor: [...rgb, 70] as RGBA, getWidth: soft, widthUnits: "pixels", capRounded: true, jointRounded: true }),
    new PathLayer<T>({ id: `${id}-core`, data, getPath, getColor: [...rgb, 235] as RGBA, getWidth: core, widthUnits: "pixels", capRounded: true, jointRounded: true }),
  ];
}

export interface LayerInput {
  hazard: HazardId;
  grid: GridPoint[];
  cells: Cell[];
  hotspots: Hotspot[];
  selected: { lat: number; lng: number } | null;
  time: number; // 0..1 loop for subtle animation (air particles + cooling ripple)
  ripple?: boolean; // expanding cooling ripple after a simulation
}

export function buildLayers({ hazard, grid, cells, hotspots, selected, time, ripple }: LayerInput): Layer[] {
  const meta = HAZARD_META[hazard];
  const [r, g, b] = meta.rgb;
  const layers: Layer[] = [];

  /* ---- 1. continuous field (heat / flood / air / green) ---- */
  const fieldData = grid.length ? grid : cells;
  layers.push(
    new HeatmapLayer<GridPoint | Cell>({
      id: `${hazard}-field`,
      data: fieldData,
      getPosition: (d) => [d.lng, d.lat],
      getWeight: (d) => d.weight,
      // MEAN: pixel colour tracks the local field value (temperature/risk),
      // not point density — SUM saturates the whole city with a dense grid.
      aggregation: "MEAN",
      radiusPixels: hazard === "flood" ? 66 : hazard === "heat" ? 62 : 52,
      intensity: hazard === "flood" ? 1.3 : 1.05,
      threshold: 0.02,
      colorRange: meta.colorRange,
      opacity: hazard === "green" ? 0.5 : 0.85,
    }),
  );

  /* ---- 2. dense accurate cells (granular texture, anchored to real grid) ---- */
  if (cells.length && hazard !== "green") {
    layers.push(
      new ScatterplotLayer<Cell>({
        id: `${hazard}-cells`,
        data: cells,
        getPosition: (d) => [d.lng, d.lat],
        getRadius: (d) => 55 + d.weight * 130,
        radiusUnits: "meters",
        radiusMinPixels: 1.1,
        radiusMaxPixels: 4.5, // texture dots, never blobs when zoomed in
        stroked: false,
        filled: true,
        getFillColor: (d) => [r, g, b, Math.round(20 + d.weight * 110)] as RGBA,
        opacity: 0.4,
      }),
    );
  }

  /* ---- 3. hazard-specific structure ---- */
  if (hazard === "flood") {
    // glowing rivers/canals
    layers.push(...glowPath("flood-rivers", PATHS.flood, (d) => d.path, [46, 154, 255], 3.5, 16));
    // drainage flow arrows along corridors
    const arrows = PATHS.flood.flatMap((c, ci) => [0.28, 0.55, 0.82].map((f, i) => {
      const s = sampleAlong(c.path, f);
      return { id: `${ci}-${i}`, lng: s.lng, lat: s.lat, angle: s.angle };
    }));
    layers.push(new IconLayer<typeof arrows[number]>({
      id: "flood-arrows", data: arrows, getPosition: (d) => [d.lng, d.lat],
      getIcon: () => ({ url: ARROW, width: 24, height: 24, mask: true }), getSize: 22, sizeUnits: "pixels",
      getAngle: (d) => d.angle, getColor: [120, 210, 255, 235],
    }));
    // detention / basin infrastructure (glow ring + core)
    layers.push(
      new ScatterplotLayer({ id: "flood-infra-glow", data: INFRA_NODES, getPosition: (d) => [d.lng, d.lat], getRadius: 420, radiusUnits: "meters", getFillColor: (d) => [NODE_COLOR[d.status][0], NODE_COLOR[d.status][1], NODE_COLOR[d.status][2], 45] as RGBA }),
      new IconLayer({ id: "flood-infra", data: INFRA_NODES, getPosition: (d) => [d.lng, d.lat], getIcon: () => ({ url: LEAF, width: 24, height: 24, mask: true }), getSize: 20, sizeUnits: "pixels", getColor: (d) => NODE_COLOR[d.status] }),
      new TextLayer({ id: "flood-infra-lbl", data: INFRA_NODES, getPosition: (d) => [d.lng, d.lat], getText: (d) => `${d.name}\n${d.metric}`, getSize: 10, getColor: [220, 235, 250, 240], getTextAnchor: "start", getPixelOffset: [14, 0], background: true, getBackgroundColor: [7, 14, 20, 185], backgroundPadding: [5, 3], fontFamily: "Roboto Mono, monospace" }),
    );
  }

  if (hazard === "air") {
    // faint corridor guides
    layers.push(...glowPath("air-corridors", PATHS.air, (d) => d.path, [r, g, b], 1.5, 8));
    // animated particle flux — subtle drift along corridors, coloured by AQI ramp
    const PER = 26;
    const particles = PATHS.air.flatMap((c, ci) =>
      Array.from({ length: PER }, (_, i) => {
        const base = i / PER;
        const frac = base + time * 0.6; // subtle speed
        const s = sampleAlong(c.path, frac);
        // pollution rises toward the coast/centre end of each corridor
        const t = ((base + time * 0.6) % 1);
        return { id: `${ci}-${i}`, lng: s.lng, lat: s.lat, t: 0.25 + t * 0.7 };
      }),
    );
    layers.push(
      new ScatterplotLayer<typeof particles[number]>({ id: "air-particles-glow", data: particles, getPosition: (d) => [d.lng, d.lat], getRadius: 130, radiusUnits: "meters", radiusMinPixels: 2, getFillColor: (d) => { const c = aqiRamp(d.t); return [c[0], c[1], c[2], 70] as RGBA; } }),
      new ScatterplotLayer<typeof particles[number]>({ id: "air-particles", data: particles, getPosition: (d) => [d.lng, d.lat], getRadius: 45, radiusUnits: "meters", radiusMinPixels: 1, getFillColor: (d) => aqiRamp(d.t) }),
    );
  }

  if (hazard === "green") {
    // glowing corridor network
    layers.push(...glowPath("green-net", PATHS.green, (d) => d.path, [52, 211, 153], 3, 13));
    // park / biodiversity hub nodes
    layers.push(
      new ScatterplotLayer({ id: "green-node-glow", data: GREEN_NODES, getPosition: (d) => [d.lng, d.lat], getRadius: 520, radiusUnits: "meters", getFillColor: [52, 211, 153, 55] }),
      new ScatterplotLayer({ id: "green-node", data: GREEN_NODES, getPosition: (d) => [d.lng, d.lat], getRadius: 90, radiusUnits: "meters", radiusMinPixels: 3, getFillColor: [167, 243, 208, 240], stroked: true, getLineColor: [52, 211, 153, 240], lineWidthMinPixels: 2 }),
      new TextLayer({ id: "green-node-lbl", data: GREEN_NODES, getPosition: (d) => [d.lng, d.lat], getText: (d) => d.name, getSize: 10, getColor: [200, 255, 228, 240], getTextAnchor: "start", getPixelOffset: [12, 0], background: true, getBackgroundColor: [6, 20, 14, 190], backgroundPadding: [5, 3], fontFamily: "Roboto Mono, monospace" }),
      // fragmentation warnings
      new IconLayer({ id: "green-frag", data: FRAGMENTATION, getPosition: (d) => [d.lng, d.lat], getIcon: () => ({ url: WARN, width: 24, height: 24, mask: true }), getSize: 22, sizeUnits: "pixels", getColor: [255, 138, 60, 245] }),
    );
  }

  if (hazard === "heat") {
    layers.push(...glowPath("heat-canyons", PATHS.heat, (d) => d.path, [r, g, b], 2, 9));
  }

  /* ---- 4. locality anchors (accurate, all layers) ---- */
  layers.push(
    new ScatterplotLayer({ id: "localities-dot", data: LOCALITIES, getPosition: (d) => [d.lng, d.lat], getRadius: 2.6, radiusUnits: "pixels", radiusMinPixels: 2.6, getFillColor: [230, 240, 248, 205] }),
    new TextLayer({ id: "localities-lbl", data: LOCALITIES, getPosition: (d) => [d.lng, d.lat], getText: (d) => d.name, getSize: 10.5, getColor: [214, 226, 236, 220], getTextAnchor: "start", getAlignmentBaseline: "center", getPixelOffset: [7, 0], fontFamily: "Roboto Mono, monospace", getBackgroundColor: [7, 14, 20, 120], background: true, backgroundPadding: [3, 1], sizeMinPixels: 9 }),
  );

  /* ---- 5. priority hotspots ---- */
  layers.push(
    new ScatterplotLayer<Hotspot>({ id: `${hazard}-hotspots`, data: hotspots, getPosition: (d) => [d.lng, d.lat], getRadius: (d) => 150 + d.priority_score * 240, radiusUnits: "meters", stroked: true, filled: true, getFillColor: [r, g, b, 150] as RGBA, getLineColor: [245, 252, 255, 235], lineWidthMinPixels: 1.5, pickable: true }),
    new TextLayer<Hotspot>({ id: `${hazard}-hotspot-lbl`, data: hotspots.slice(0, 6), getPosition: (d) => [d.lng, d.lat], getText: (d) => `${d.name}  ${Math.round(d.priority_score * 100)}`, getSize: 11.5, getColor: [238, 246, 250, 240], getTextAnchor: "middle", getAlignmentBaseline: "bottom", getPixelOffset: [0, -16], background: true, getBackgroundColor: [7, 14, 20, 200], backgroundPadding: [5, 3], fontFamily: "Roboto Mono, monospace" }),
  );

  /* ---- 5b. cooling ripple (expanding rings after a simulation) ---- */
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

  /* ---- 6. selection ring ---- */
  if (selected) {
    layers.push(
      new ScatterplotLayer({ id: "sel-glow", data: [selected], getPosition: (d) => [d.lng, d.lat], getRadius: 520, radiusUnits: "meters", getFillColor: [r, g, b, 60] as RGBA }),
      new ScatterplotLayer({ id: "sel-ring", data: [selected], getPosition: (d) => [d.lng, d.lat], getRadius: 240, radiusUnits: "meters", getFillColor: [r, g, b, 120] as RGBA, stroked: true, getLineColor: [255, 255, 255, 255], lineWidthMinPixels: 3 }),
    );
  }

  return layers;
}
