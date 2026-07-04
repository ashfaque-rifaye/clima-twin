// ClimaTwin API integration layer.
// In the deployed container the frontend is served same-origin, so VITE_API_BASE
// is built as "" (relative). Locally it defaults to the dev backend.
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

// --- auth-ready: an optional bearer token is attached to every request. ---
// Wire a real IdP later by calling setAuthToken() after sign-in; no-op until then.
let authToken: string | null =
  typeof localStorage !== "undefined" ? localStorage.getItem("ct_token") : null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (typeof localStorage !== "undefined") {
    if (token) localStorage.setItem("ct_token", token);
    else localStorage.removeItem("ct_token");
  }
}

function headers(json = false): HeadersInit {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (authToken) h["Authorization"] = `Bearer ${authToken}`;
  return h;
}

const GET_TIMEOUT_MS = 15_000;
const POST_TIMEOUT_MS = 45_000; // AI endpoints (Gemini) can be slow

async function request<T>(path: string, init: RequestInit, timeoutMs: number, retries: number): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(`${BASE}${path}`, { ...init, signal: ctrl.signal });
      if (r.ok) return (await r.json()) as T;
      lastErr = new Error(`${path} ${r.status}`);
      if (r.status < 500) break; // 4xx won't improve on retry
    } catch (e) {
      lastErr = e; // network error / timeout — retry if allowed
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

const getJSON = <T,>(path: string) =>
  request<T>(path, { headers: headers() }, GET_TIMEOUT_MS, 1);

const postJSON = <T,>(path: string, body: unknown) =>
  request<T>(
    path,
    { method: "POST", headers: headers(true), body: JSON.stringify(body) },
    POST_TIMEOUT_MS,
    0, // POSTs are not retried automatically — the user can retry from the UI
  );

/* ---------------- types ---------------- */
export interface Hotspot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  priority_score: number;
  why: string;
}
export interface HotspotsResp { hazard: string; hotspots: Hotspot[]; source: string; }

export interface SimInterv { type: string; species?: string; count: number; }

export interface SimResult {
  area_name?: string;
  baseline_feels_like_c?: number;
  projected_feels_like_c?: number;
  delta_feels_like_c: number;
  cooled_area_m2: number;
  people_helped: number;
  cost_inr: number;
  over_budget: boolean;
  air_quality_change?: string;
  flood_change?: string;
  confidence: string;
  what_could_go_wrong: string[];
  source: string;
}

export interface Recommendation {
  area_name?: string;
  goal: string;
  interventions: SimInterv[];
  effect: Partial<SimResult>;
  rationale: string;
  trade_offs: string[];
  source: string;
}

export interface AskResp { answer: string; source: string; }
export interface ProposalResp { title: string; markdown: string; source: string; }
export interface AppConfig { maps_api_key: string; has_maps: boolean; }

export interface PointData {
  lat: number;
  lng: number;
  area_name?: string;
  live: boolean;
  heat?: { feels_like_c?: number; temp_c?: number; condition?: string; humidity?: number };
  air?: { aqi?: number; category?: string; dominant?: string; health?: string };
  flood?: { risk?: string; rain_prob?: number; basis?: string };
  elevation_m?: number;
  vulnerability?: {
    ndvi?: number;
    green_cover_pct?: number;
    commuter_footfall?: string;
    elderly_pct?: number;
    population?: number;
    data_blind_spot?: boolean;
  };
  prediction?: string;
  source: string;
}

export interface GridPoint {
  lat: number;
  lng: number;
  weight: number;
  value?: number | string | null;
  name?: string | null;
  flood_risk?: string | null;
  aqi?: number | null;
  feels_like_c?: number | null;
}
export interface GridResp { hazard: string; source?: string; points: GridPoint[]; }

/* ---- multi-resolution tiles ---- */
export type TileBand = "country" | "state" | "city" | "block" | "street";
export interface TileCell { lat: number; lng: number; weight: number }
export interface TileSummary { name: string; lat: number; lng: number; value: number }
export interface TileRiver { name: string; path: [number, number][] }
export interface TileAsset { name: string; kind: string; lat: number; lng: number }
export interface TileResp {
  band: TileBand;
  z: number;
  x: number;
  y: number;
  bounds: [number, number, number, number];
  extent: [number, number, number, number] | null;
  source: string;
  cells: TileCell[];
  summaries: TileSummary[];
  rivers: TileRiver[];
  assets: TileAsset[];
}

/** Tile fetch: no retry/timeout wrapper — the TileLayer aborts + retries. */
export async function getTile(hazard: string, z: number, x: number, y: number, signal?: AbortSignal): Promise<TileResp> {
  const r = await fetch(`${BASE}/tiles/${hazard}/${z}/${x}/${y}`, { headers: headers(), signal });
  if (!r.ok) throw new Error(`tile ${z}/${x}/${y} ${r.status}`);
  return r.json() as Promise<TileResp>;
}

/* ---------------- endpoints ---------------- */
export const getConfig = () => getJSON<AppConfig>("/config");
export const getHotspots = (hazard: string, limit = 8) =>
  getJSON<HotspotsResp>(`/hotspots?hazard=${hazard}&limit=${limit}`);
export const getPoint = (lat: number, lng: number) =>
  getJSON<PointData>(`/point?lat=${lat}&lng=${lng}`);
export const getGrid = (hazard: string) => getJSON<GridResp>(`/grid?hazard=${hazard}`);

export const simulate = (lat: number, lng: number, interventions: SimInterv[], budget_inr?: number) =>
  postJSON<SimResult>("/simulate", { lat, lng, interventions, budget_inr });
export const recommend = (lat: number, lng: number, goal: string, budget_inr?: number) =>
  postJSON<Recommendation>("/recommend", { lat, lng, goal, budget_inr });
export const ask = (question: string) => postJSON<AskResp>("/ask", { question });
export const proposal = (area_name: string, plan: unknown) =>
  postJSON<ProposalResp>("/proposal", { area_name, plan });
