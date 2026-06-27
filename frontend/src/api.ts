// In the deployed container the frontend is served same-origin, so VITE_API_BASE
// is built as "" (relative). Locally it defaults to the dev backend.
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

export interface Microclimate {
  lat: number;
  lng: number;
  area_name?: string;
  surface_temp_c?: number;
  feels_like_c?: number;
  air_quality_index?: number;
  dominant_pollutant?: string;
  green_cover_pct?: number;
  flood_risk?: string;
  population?: number;
  bus_commuters_daily?: number;
  elderly_pct?: number;
  data_density?: string;
  source: string;
}

export interface Hotspot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  priority_score: number;
  why: string;
}

export interface HotspotsResp {
  hazard: string;
  hotspots: Hotspot[];
  source: string;
}

export async function getMicroclimate(lat: number, lng: number): Promise<Microclimate> {
  const r = await fetch(`${BASE}/microclimate?lat=${lat}&lng=${lng}`);
  if (!r.ok) throw new Error(`microclimate ${r.status}`);
  return r.json();
}

export async function getHotspots(hazard: string, limit = 6): Promise<HotspotsResp> {
  const r = await fetch(`${BASE}/hotspots?hazard=${hazard}&limit=${limit}`);
  if (!r.ok) throw new Error(`hotspots ${r.status}`);
  return r.json();
}

export interface SimInterv {
  type: string;
  species?: string;
  count: number;
}

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

export async function simulate(
  lat: number,
  lng: number,
  interventions: SimInterv[],
  budget_inr?: number,
): Promise<SimResult> {
  const r = await fetch(`${BASE}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, interventions, budget_inr }),
  });
  if (!r.ok) throw new Error(`simulate ${r.status}`);
  return r.json();
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

export async function recommend(
  lat: number,
  lng: number,
  goal: string,
  budget_inr?: number,
): Promise<Recommendation> {
  const r = await fetch(`${BASE}/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, goal, budget_inr }),
  });
  if (!r.ok) throw new Error(`recommend ${r.status}`);
  return r.json();
}

export interface AskResp { answer: string; source: string; }

export async function ask(question: string): Promise<AskResp> {
  const r = await fetch(`${BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!r.ok) throw new Error(`ask ${r.status}`);
  return r.json();
}

export interface ProposalResp { title: string; markdown: string; source: string; }

export async function proposal(area_name: string, plan: unknown): Promise<ProposalResp> {
  const r = await fetch(`${BASE}/proposal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ area_name, plan }),
  });
  if (!r.ok) throw new Error(`proposal ${r.status}`);
  return r.json();
}

export interface AppConfig { maps_api_key: string; has_maps: boolean; }

export async function getConfig(): Promise<AppConfig> {
  const r = await fetch(`${BASE}/config`);
  if (!r.ok) throw new Error(`config ${r.status}`);
  return r.json();
}

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

export async function getPoint(lat: number, lng: number): Promise<PointData> {
  const r = await fetch(`${BASE}/point?lat=${lat}&lng=${lng}`);
  if (!r.ok) throw new Error(`point ${r.status}`);
  return r.json();
}
