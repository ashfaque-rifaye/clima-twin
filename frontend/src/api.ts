const BASE = (import.meta.env.VITE_API_BASE as string) || "http://localhost:8000";

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
