import { useCallback, useEffect, useState, type FormEvent } from "react";
import HeatBoard from "./HeatBoard";
import MapView from "./MapView";
import {
  ask, getConfig, getHotspots, getMicroclimate, proposal, recommend, simulate,
} from "./api";
import type {
  Hotspot, Microclimate, ProposalResp, Recommendation, SimResult,
} from "./api";
import "./App.css";

const HAZARDS = [
  { id: "heat", label: "Heat", icon: "🔥" },
  { id: "flood", label: "Flood", icon: "🌊" },
  { id: "air", label: "Air", icon: "🌫️" },
] as const;

const PALETTE = [
  { key: "pungai", label: "🌳 Pungai", type: "tree", step: 20 },
  { key: "neem", label: "🌳 Neem", type: "tree", step: 20 },
  { key: "cool_roof", label: "🏠 Cool roof", type: "cool_roof", step: 2 },
  { key: "shade_sail", label: "⛱️ Shade", type: "shade", step: 1 },
  { key: "misting", label: "💧 Misting", type: "misting", step: 1 },
  { key: "rain_garden", label: "🌧️ Rain garden", type: "rain_garden", step: 2 },
] as const;

const inr = new Intl.NumberFormat("en-IN");
const fmtINR = (n: number) => `₹${inr.format(Math.round(n))}`;
const typeOf = (key: string) => PALETTE.find((p) => p.key === key)?.type ?? key;

function aqiBand(aqi?: number) {
  if (aqi == null) return "";
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 150) return "poor";
  if (aqi <= 200) return "unhealthy";
  return "severe";
}

function TempRing({ value }: { value?: number }) {
  const v = value ?? 0;
  const pct = Math.max(0, Math.min(1, (v - 28) / 20));
  const R = 48, C = 2 * Math.PI * R;
  const col = v >= 44 ? "#e23b3b" : v >= 40 ? "#ef6f3c" : v >= 36 ? "#f6c453" : "#19c39a";
  return (
    <svg className="ring" viewBox="0 0 120 120" width="108" height="108">
      <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="10" />
      <circle
        cx="60" cy="60" r={R} fill="none" stroke={col} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${pct * C} ${C}`} transform="rotate(-90 60 60)"
      />
      <text x="60" y="58" textAnchor="middle" fontSize="27" fontWeight="800" fill="#fff">{v.toFixed(0)}°</text>
      <text x="60" y="77" textAnchor="middle" fontSize="10" fill="#8aa0b2">feels-like</text>
    </svg>
  );
}

export default function App() {
  const [hazard, setHazard] = useState<string>("heat");
  const [nodes, setNodes] = useState<Hotspot[]>([]);
  const [readout, setReadout] = useState<Microclimate | null>(null);
  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [mapsKey, setMapsKey] = useState<string | null>(null);

  const [mix, setMix] = useState<Record<string, number>>({});
  const [budget, setBudget] = useState(500000);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [simBusy, setSimBusy] = useState(false);

  const [reco, setReco] = useState<Recommendation | null>(null);
  const [recoBusy, setRecoBusy] = useState(false);

  const [askQ, setAskQ] = useState("");
  const [askAns, setAskAns] = useState<string | null>(null);
  const [askBusy, setAskBusy] = useState(false);

  const [prop, setProp] = useState<ProposalResp | null>(null);
  const [propBusy, setPropBusy] = useState(false);

  useEffect(() => {
    getHotspots(hazard, 8)
      .then((r) => { setNodes(r.hotspots); setApiError(false); })
      .catch(() => { setNodes([]); setApiError(true); });
  }, [hazard]);

  useEffect(() => {
    getConfig().then((c) => { if (c.has_maps) setMapsKey(c.maps_api_key); }).catch(() => {});
  }, []);

  const inspect = useCallback(async (lat: number, lng: number) => {
    setSelected({ lat, lng });
    setLoading(true);
    setMix({}); setSim(null); setReco(null); setProp(null);
    try {
      setReadout(await getMicroclimate(lat, lng));
      setApiError(false);
    } catch {
      setReadout(null); setApiError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const bump = (key: string, d: number) =>
    setMix((m) => ({ ...m, [key]: Math.max(0, (m[key] || 0) + d) }));

  const runSim = useCallback(async () => {
    if (!selected) return;
    const interventions = PALETTE.filter((p) => (mix[p.key] || 0) > 0).map((p) => ({
      type: p.type, species: p.key, count: mix[p.key],
    }));
    if (!interventions.length) return;
    setSimBusy(true);
    try { setSim(await simulate(selected.lat, selected.lng, interventions, budget)); }
    catch { setSim(null); }
    finally { setSimBusy(false); }
  }, [selected, mix, budget]);

  const runReco = useCallback(async () => {
    if (!selected) return;
    setRecoBusy(true);
    try {
      const r = await recommend(selected.lat, selected.lng, `reduce ${hazard} risk for commuters`, budget);
      setReco(r);
      const m: Record<string, number> = {};
      r.interventions.forEach((iv) => { m[iv.species ?? iv.type] = iv.count; });
      setMix(m);
      setSim(await simulate(selected.lat, selected.lng, r.interventions, budget));
    } catch { setReco(null); }
    finally { setRecoBusy(false); }
  }, [selected, hazard, budget]);

  const runAsk = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!askQ.trim()) return;
    setAskBusy(true); setAskAns(null);
    try { setAskAns((await ask(askQ)).answer); }
    catch { setAskAns("Couldn't reach the assistant — is the backend running on :8000?"); }
    finally { setAskBusy(false); }
  }, [askQ]);

  const runProposal = useCallback(async () => {
    if (!readout) return;
    setPropBusy(true);
    try {
      setProp(await proposal(readout.area_name ?? "Selected area", {
        area: readout.area_name, interventions: PALETTE.filter((p) => mix[p.key]).map((p) => ({ type: typeOf(p.key), species: p.key, count: mix[p.key] })), effect: sim,
      }));
    } catch { setProp(null); }
    finally { setPropBusy(false); }
  }, [readout, mix, sim]);

  const hz = HAZARDS.find((h) => h.id === hazard)!;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo">🌿</span> ClimaTwin</div>
        <div className="loc-chip">📍 Chennai, IN</div>
        <div className="spacer" />
        <form className="askbar" onSubmit={runAsk}>
          <input
            value={askQ} onChange={(e) => setAskQ(e.target.value)}
            placeholder="Ask ClimaTwin — e.g. which area is hottest?"
          />
          <button disabled={askBusy}>{askBusy ? "…" : "Ask"}</button>
        </form>
      </header>

      {askAns && (
        <div className="ask-banner">
          <span>🤖 {askAns}</span>
          <button onClick={() => setAskAns(null)}>✕</button>
        </div>
      )}

      <div className="body">
        <aside className="rail">
          <h3>Hazard</h3>
          <div className="hazards">
            {HAZARDS.map((h) => (
              <button key={h.id} className={hazard === h.id ? `haz active ${h.id}` : "haz"} onClick={() => setHazard(h.id)}>
                <span>{h.icon}</span>{h.label}
              </button>
            ))}
          </div>

          <h3>Priority hotspots</h3>
          {apiError && <p className="warn">Backend unreachable — start it on :8000.</p>}
          <div className="hotspot-list">
            {nodes.map((h, i) => (
              <button key={h.id} className="hotspot-card" onClick={() => inspect(h.lat, h.lng)}>
                <div className="rank">{i + 1}</div>
                <div className="hc-body">
                  <div className="hc-name">{h.name}</div>
                  <div className="hc-bar"><span style={{ width: `${Math.min(100, h.priority_score * 100)}%` }} /></div>
                </div>
                <div className="score">{h.priority_score.toFixed(2)}</div>
              </button>
            ))}
          </div>
        </aside>

        <main className="stage">
          <div className="stage-head">
            <span className="stage-title">{hz.icon} Chennai · {hz.label} risk</span>
            <span className="legend"><i className="lo" /> low<i className="hi" /> high · {nodes.length} zones</span>
          </div>
          <div className="stage-board">
            {mapsKey
              ? <MapView apiKey={mapsKey} hazard={hazard} nodes={nodes} selected={selected} onSelect={inspect} />
              : <HeatBoard hazard={hazard} nodes={nodes} selected={selected} onSelect={inspect} />}
          </div>
        </main>

        <aside className="decision">
          {!readout && !loading && (
            <div className="empty">
              <div className="empty-badge">{hz.icon}</div>
              <h2>Pick a zone to act</h2>
              <p>Click a glowing node on the board (or a hotspot on the left) to read its microclimate, simulate a fix, and generate a proposal.</p>
            </div>
          )}

          {loading && !readout && <div className="empty"><h2>Reading microclimate…</h2></div>}

          {readout && (
            <div className="dpanel">
              <div className="dp-head">
                <div>
                  <div className="dp-name">{readout.area_name ?? "Selected point"}</div>
                  <div className="dp-sub">{readout.source} data · {readout.data_density} density</div>
                </div>
                <TempRing value={readout.feels_like_c} />
              </div>

              <div className="pills">
                <div className={`pill aqi-${aqiBand(readout.air_quality_index)}`}>AQI {readout.air_quality_index} <small>{readout.dominant_pollutant}</small></div>
                <div className="pill">🌳 {readout.green_cover_pct}% canopy</div>
                <div className="pill">🌊 {readout.flood_risk}</div>
                <div className="pill">🚌 {readout.bus_commuters_daily?.toLocaleString()}/day</div>
                <div className="pill">👵 {readout.elderly_pct}%</div>
                <div className="pill">🌡 surface {readout.surface_temp_c?.toFixed(0)}°</div>
              </div>

              <button className="reco-btn" onClick={runReco} disabled={recoBusy}>
                {recoBusy ? "Thinking…" : "✨ Recommend a plan"}
              </button>

              {reco && (
                <div className="reco">
                  <div className="reco-tag">AI plan · {reco.source}</div>
                  <p className="reco-text">{reco.rationale}</p>
                </div>
              )}

              <div className="sim">
                <div className="sim-title">Tune the fix</div>
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
                  <span>Budget {fmtINR(budget)}</span>
                  <input type="range" min={0} max={1000000} step={25000} value={budget} onChange={(e) => setBudget(+e.target.value)} />
                </label>
                <button className="simbtn" onClick={runSim} disabled={simBusy}>{simBusy ? "Simulating…" : "Simulate cooling"}</button>
              </div>

              {sim && (
                <div className="sim-res">
                  <div className="sr-temp">
                    <span className="from">{sim.baseline_feels_like_c?.toFixed(0)}°</span>
                    <span className="arrow">→</span>
                    <span className="to">{sim.projected_feels_like_c?.toFixed(0)}°</span>
                    <span className="drop">−{sim.delta_feels_like_c.toFixed(1)}°C</span>
                  </div>
                  <div className="sr-stats">
                    <div className="stat"><b>{sim.people_helped.toLocaleString()}</b><span>people</span></div>
                    <div className={`stat ${sim.over_budget ? "over" : ""}`}><b>{fmtINR(sim.cost_inr)}</b><span>{sim.over_budget ? "over budget" : "cost"}</span></div>
                    <div className="stat"><b>{(sim.cooled_area_m2 / 1000).toFixed(1)}k</b><span>m² cooled</span></div>
                  </div>
                  {(sim.air_quality_change || sim.flood_change) && (
                    <div className="cobenefit">{sim.air_quality_change && <span>🌫️ {sim.air_quality_change}</span>}{sim.flood_change && <span>🌊 {sim.flood_change}</span>}</div>
                  )}
                  <div className="risks"><b>What could go wrong</b><ul>{sim.what_could_go_wrong.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
                  <button className="propbtn" onClick={runProposal} disabled={propBusy}>{propBusy ? "Drafting…" : "📄 Generate proposal"}</button>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {prop && (
        <div className="modal" onClick={() => setProp(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head"><b>{prop.title}</b><span className="src">{prop.source}</span><button onClick={() => setProp(null)}>✕</button></div>
            <pre className="sheet-body">{prop.markdown}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
