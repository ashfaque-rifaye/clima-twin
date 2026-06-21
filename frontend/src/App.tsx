import { useCallback, useEffect, useState } from "react";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { getHotspots, getMicroclimate, simulate } from "./api";
import type { Hotspot, Microclimate, SimResult } from "./api";
import "./App.css";

const CHENNAI = { lat: 13.0827, lng: 80.2707 };

const HAZARDS = [
  { id: "heat", label: "Heat", icon: "🔥" },
  { id: "flood", label: "Flood", icon: "🌊" },
  { id: "air", label: "Air", icon: "🌫️" },
] as const;

const PALETTE = [
  { key: "pungai", label: "🌳 Pungai", type: "tree", step: 20 },
  { key: "neem", label: "🌳 Neem", type: "tree", step: 20 },
  { key: "cool_roof", label: "🏠 Cool roof", type: "cool_roof", step: 1 },
  { key: "shade_sail", label: "⛱️ Shade", type: "shade", step: 1 },
  { key: "misting", label: "💧 Misting", type: "misting", step: 1 },
  { key: "rain_garden", label: "🌧️ Rain garden", type: "rain_garden", step: 1 },
] as const;

const inr = new Intl.NumberFormat("en-IN");
const fmtINR = (n: number) => `₹${inr.format(Math.round(n))}`;

function aqiBand(aqi?: number) {
  if (aqi == null) return "";
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 150) return "poor";
  if (aqi <= 200) return "unhealthy";
  return "severe";
}

export default function App() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;

  const [hazard, setHazard] = useState<string>("heat");
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [readout, setReadout] = useState<Microclimate | null>(null);
  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(false);

  // simulate state
  const [mix, setMix] = useState<Record<string, number>>({});
  const [budget, setBudget] = useState(500000);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [simBusy, setSimBusy] = useState(false);

  useEffect(() => {
    getHotspots(hazard, 6)
      .then((r) => { setHotspots(r.hotspots); setApiError(false); })
      .catch(() => { setHotspots([]); setApiError(true); });
  }, [hazard]);

  const inspect = useCallback(async (lat: number, lng: number) => {
    setSelected({ lat, lng });
    setLoading(true);
    setMix({});
    setSim(null);
    try {
      setReadout(await getMicroclimate(lat, lng));
      setApiError(false);
    } catch {
      setReadout(null);
      setApiError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const bump = (key: string, delta: number) =>
    setMix((m) => ({ ...m, [key]: Math.max(0, (m[key] || 0) + delta) }));

  const runSim = useCallback(async () => {
    if (!selected) return;
    const interventions = PALETTE.filter((p) => (mix[p.key] || 0) > 0).map((p) => ({
      type: p.type,
      species: p.key,
      count: mix[p.key],
    }));
    if (!interventions.length) return;
    setSimBusy(true);
    try {
      setSim(await simulate(selected.lat, selected.lng, interventions, budget));
    } catch {
      setSim(null);
    } finally {
      setSimBusy(false);
    }
  }, [selected, mix, budget]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🌿 ClimaTwin <span>· Chennai</span></div>
        <div className="tag">Urban Microclimate Decision Engine</div>
      </header>

      <div className="body">
        <aside className="sidebar">
          <h2>Hazard</h2>
          <div className="hazards">
            {HAZARDS.map((h) => (
              <button
                key={h.id}
                className={hazard === h.id ? "haz active" : "haz"}
                onClick={() => setHazard(h.id)}
              >
                <span>{h.icon}</span>{h.label}
              </button>
            ))}
          </div>

          <h2>Priority hotspots</h2>
          {apiError && <p className="warn">Backend not reachable — start it on :8000.</p>}
          <div className="hotspot-list">
            {hotspots.map((h, i) => (
              <button key={h.id} className="hotspot-card" onClick={() => inspect(h.lat, h.lng)}>
                <div className="rank">{i + 1}</div>
                <div className="hc-body">
                  <div className="hc-name">{h.name}</div>
                  <div className="hc-why">{h.why}</div>
                </div>
                <div className="score">{h.priority_score.toFixed(2)}</div>
              </button>
            ))}
          </div>
          <p className="hint">Click a hotspot or the map to inspect, then try a fix. AI recommendations &amp; proposals arrive on Days 4–5.</p>
        </aside>

        <main className="mapwrap">
          {apiKey ? (
            <APIProvider apiKey={apiKey}>
              <Map
                defaultCenter={CHENNAI}
                defaultZoom={12}
                mapId={mapId}
                gestureHandling="greedy"
                onClick={(ev) => {
                  const ll = ev.detail.latLng;
                  if (ll) inspect(ll.lat, ll.lng);
                }}
                style={{ width: "100%", height: "100%" }}
              >
                {hotspots.map((h) => (
                  <Marker key={h.id} position={{ lat: h.lat, lng: h.lng }} onClick={() => inspect(h.lat, h.lng)} />
                ))}
                {selected && <Marker position={selected} />}
              </Map>
            </APIProvider>
          ) : (
            <div className="setup">
              <h3>Map needs a key 🔑</h3>
              <p>Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to <code>frontend/.env</code> and restart.</p>
              <p>Meanwhile the platform is fully usable — <b>click a hotspot</b> on the left to inspect &amp; simulate.</p>
            </div>
          )}

          {(readout || loading) && (
            <div className="readout">
              {loading && !readout ? (
                <div className="ro-loading">Reading microclimate…</div>
              ) : readout ? (
                <>
                  <div className="ro-head">
                    <span className="ro-name">{readout.area_name ?? "Selected point"}</span>
                    <span className="ro-src">{readout.source} data</span>
                  </div>
                  <div className="ro-feels">
                    <span className="big">{readout.feels_like_c?.toFixed(0)}°C</span>
                    <span className="ro-sub">feels-like · surface {readout.surface_temp_c?.toFixed(0)}°C</span>
                  </div>
                  <div className="ro-grid">
                    <div className={`pill aqi-${aqiBand(readout.air_quality_index)}`}>
                      AQI {readout.air_quality_index} <small>{readout.dominant_pollutant}</small>
                    </div>
                    <div className="pill">🌳 {readout.green_cover_pct}% canopy</div>
                    <div className="pill">🌊 flood: {readout.flood_risk}</div>
                    <div className="pill">🚌 {readout.bus_commuters_daily?.toLocaleString()} /day</div>
                    <div className="pill">👵 {readout.elderly_pct}% elderly</div>
                    <div className="pill">📡 data: {readout.data_density}</div>
                  </div>

                  <div className="sim">
                    <div className="sim-title">Try a fix</div>
                    <div className="palette">
                      {PALETTE.map((p) => (
                        <div key={p.key} className={mix[p.key] ? "pchip on" : "pchip"}>
                          <span className="pl">{p.label}</span>
                          <div className="step">
                            <button onClick={() => bump(p.key, -p.step)}>−</button>
                            <span>{mix[p.key] || 0}</span>
                            <button onClick={() => bump(p.key, p.step)}>+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <label className="budget">
                      <span>Budget: {fmtINR(budget)}</span>
                      <input
                        type="range" min={0} max={1000000} step={25000}
                        value={budget} onChange={(e) => setBudget(+e.target.value)}
                      />
                    </label>
                    <button className="simbtn" onClick={runSim} disabled={simBusy}>
                      {simBusy ? "Simulating…" : "Simulate cooling"}
                    </button>

                    {sim && (
                      <div className="sim-res">
                        <div className="sr-temp">
                          <span className="from">{sim.baseline_feels_like_c?.toFixed(0)}°</span>
                          <span className="arrow">→</span>
                          <span className="to">{sim.projected_feels_like_c?.toFixed(0)}°C</span>
                          <span className="drop">−{sim.delta_feels_like_c.toFixed(1)}°C</span>
                        </div>
                        <div className="sr-grid">
                          <div className="pill">👥 {sim.people_helped.toLocaleString()} helped</div>
                          <div className={sim.over_budget ? "pill over" : "pill"}>
                            {fmtINR(sim.cost_inr)}{sim.over_budget ? " ⚠ over" : ""}
                          </div>
                          {sim.air_quality_change && <div className="pill">🌫️ {sim.air_quality_change}</div>}
                          {sim.flood_change && <div className="pill">🌊 {sim.flood_change}</div>}
                        </div>
                        <div className="risks">
                          <b>What could go wrong</b>
                          <ul>{sim.what_could_go_wrong.map((r, i) => <li key={i}>{r}</li>)}</ul>
                        </div>
                        <div className="conf">{sim.confidence}</div>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
