import { useCallback, useEffect, useState, type FormEvent } from "react";
import HeatBoard from "./HeatBoard";
import MapView from "./MapView";
import ErrorBoundary from "./ErrorBoundary";
import {
  ask, getConfig, getHotspots, getPoint, proposal, recommend, simulate,
} from "./api";
import type {
  Hotspot, PointData, ProposalResp, Recommendation, SimResult,
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
const aqiClass = (a?: number) => (a == null ? "" : a <= 50 ? "good" : a <= 100 ? "mod" : a <= 150 ? "poor" : a <= 200 ? "bad" : "sev");
const ndviLabel = (v?: number) => (v == null ? "—" : v < 0.2 ? "Low" : v < 0.4 ? "Moderate" : "High");
const coord = (lat: number, lng: number) => `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? "E" : "W"}`;

export default function App() {
  const [hazard, setHazard] = useState<string>("heat");
  const [nodes, setNodes] = useState<Hotspot[]>([]);
  const [mapsKey, setMapsKey] = useState<string | null>(null);

  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(null);
  const [point, setPoint] = useState<PointData | null>(null);
  const [pointBusy, setPointBusy] = useState(false);

  const [reco, setReco] = useState<Recommendation | null>(null);
  const [recoBusy, setRecoBusy] = useState(false);

  const [drawer, setDrawer] = useState(false);
  const [mix, setMix] = useState<Record<string, number>>({});
  const [budget, setBudget] = useState(500000);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const [prop, setProp] = useState<ProposalResp | null>(null);
  const [propBusy, setPropBusy] = useState(false);

  const [askQ, setAskQ] = useState("");
  const [askAns, setAskAns] = useState<string | null>(null);
  const [askBusy, setAskBusy] = useState(false);

  useEffect(() => { getHotspots(hazard, 8).then((r) => setNodes(r.hotspots)).catch(() => setNodes([])); }, [hazard]);
  useEffect(() => { getConfig().then((c) => { if (c.has_maps) setMapsKey(c.maps_api_key); }).catch(() => {}); }, []);
  // populate the dashboard on load with a default Chennai location
  useEffect(() => { inspect(13.0827, 80.2707); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const inspect = useCallback(async (lat: number, lng: number) => {
    setSelected({ lat, lng });
    setPointBusy(true); setRecoBusy(true);
    setPoint(null); setReco(null); setDrawer(false); setSim(null); setProp(null); setMix({});
    try { setPoint(await getPoint(lat, lng)); } catch { setPoint(null); } finally { setPointBusy(false); }
    try {
      const r = await recommend(lat, lng, `reduce ${hazard} risk for commuters`, budget);
      setReco(r);
    } catch { setReco(null); } finally { setRecoBusy(false); }
  }, [hazard, budget]);

  const openDrawer = useCallback(() => {
    if (!selected) return;
    setDrawer(true);
    if (reco) { const m: Record<string, number> = {}; reco.interventions.forEach((i) => { m[i.species ?? i.type] = i.count; }); setMix(m); }
  }, [selected, reco]);

  const bump = (key: string, d: number) => setMix((m) => ({ ...m, [key]: Math.max(0, (m[key] || 0) + d) }));

  const runSim = useCallback(async () => {
    if (!selected) return;
    const iv = PALETTE.filter((p) => (mix[p.key] || 0) > 0).map((p) => ({ type: p.type, species: p.key, count: mix[p.key] }));
    if (!iv.length) return;
    setSimBusy(true);
    try { setSim(await simulate(selected.lat, selected.lng, iv, budget)); } catch { setSim(null); } finally { setSimBusy(false); }
  }, [selected, mix, budget]);

  const runProposal = useCallback(async () => {
    if (!selected) return;
    setPropBusy(true);
    try {
      setProp(await proposal(point?.area_name ?? "Selected area", {
        area: point?.area_name, interventions: PALETTE.filter((p) => mix[p.key]).map((p) => ({ type: p.type, species: p.key, count: mix[p.key] })), effect: sim ?? reco?.effect,
      }));
    } catch { setProp(null); } finally { setPropBusy(false); }
  }, [selected, point, mix, sim, reco]);

  const runAsk = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!askQ.trim()) return;
    setAskBusy(true); setAskAns(null);
    try { setAskAns((await ask(askQ)).answer); } catch { setAskAns("Couldn't reach the assistant."); } finally { setAskBusy(false); }
  }, [askQ]);

  const v = point?.vulnerability;

  return (
    <div className="app">
      {mapsKey ? (
        <ErrorBoundary fallback={<HeatBoard hazard={hazard} nodes={nodes} selected={selected} onSelect={inspect} />}>
          <MapView apiKey={mapsKey} hazard={hazard} selected={selected} onSelect={inspect} />
        </ErrorBoundary>
      ) : (
        <div className="board-wrap"><HeatBoard hazard={hazard} nodes={nodes} selected={selected} onSelect={inspect} /></div>
      )}

      <div className="hud-top">
        <div className="brand">🌿 ClimaTwin <span>· Chennai</span></div>
        <form className="askbar" onSubmit={runAsk}>
          <input value={askQ} onChange={(e) => setAskQ(e.target.value)} placeholder="Ask ClimaTwin…" />
          <button disabled={askBusy}>{askBusy ? "…" : "Ask"}</button>
        </form>
      </div>
      {askAns && <div className="ask-pop"><span>🤖 {askAns}</span><button onClick={() => setAskAns(null)}>✕</button></div>}

      <div className="layers-card">
        <div className="lc-title">Hazard layers</div>
        {HAZARDS.map((h) => (
          <button key={h.id} className={hazard === h.id ? `layer on ${h.id}` : "layer"} onClick={() => setHazard(h.id)}>
            <span className="li">{h.icon}</span><span className="ln">{h.label}</span><i className="dot" />
          </button>
        ))}
        <div className="lc-foot">● Live data · click the map for values</div>
      </div>

      {(point || pointBusy) && (
        <div className="hud">
          {pointBusy && !point ? <div className="hud-loading">Reading live conditions…</div> : point ? (
            <>
              <div className="hud-coord">
                <span className="hc-icon">◎</span>
                <span className="hc-c">{coord(point.lat, point.lng)}</span>
                <button className="hc-x" onClick={() => { setPoint(null); setReco(null); setSelected(null); }}>✕</button>
              </div>

              <div className="panel">
                <div className="p-title">Microclimate Analysis <span className="p-loc">{point.area_name}{point.live ? " · ● LIVE" : ""}</span></div>
                <div className="big-temp">
                  <span className="bt-v">{point.heat?.feels_like_c?.toFixed(0)}°C</span>
                  <span className="bt-l">{point.heat?.condition ?? "Feels-like"} <small>(feels-like)</small></span>
                </div>
                <div className="tri">
                  <div className="tri-cell"><span className="tc-k">🌿 NDVI</span><span className="tc-v teal">{v?.ndvi ?? "—"}</span><span className="tc-s">{ndviLabel(v?.ndvi)}</span></div>
                  <div className="tri-cell"><span className="tc-k">🟣 AQI</span><span className={`tc-v aqi-${aqiClass(point.air?.aqi)}`}>{point.air?.aqi ?? "—"}</span><span className="tc-s">{point.air?.category ?? "—"}</span></div>
                  <div className="tri-cell"><span className="tc-k">🌊 Flood</span><span className="tc-v flood">{point.flood?.risk ?? "—"}</span><span className="tc-s">{point.flood?.rain_prob ?? 0}% rain</span></div>
                </div>
                <div className="elev">⛰ elevation {point.elevation_m != null ? `${point.elevation_m.toFixed(0)} m` : "—"}</div>
              </div>

              <div className="panel">
                <div className="p-title">Vulnerability Index</div>
                <div className="vrow"><span>Commuter Footfall</span><b className="badge">{v?.commuter_footfall ?? "—"}</b></div>
                <div className="vrow"><span>Elderly Population</span><b className="badge">{v?.elderly_pct ?? "—"}%</b></div>
                <div className="vrow"><span>Priority Status</span><b className={v?.data_blind_spot ? "badge alert" : "badge ok"}>{v?.data_blind_spot ? "⚠ Data Blind Spot" : "Monitored"}</b></div>
              </div>

              <div className="panel ai">
                <div className="p-title">AI Insight</div>
                {point.prediction && <p className="ai-fore"><b>🔮 Forecast.</b> {point.prediction}</p>}
                {recoBusy && <p className="ai-fore muted">✨ Generating recommendation…</p>}
                {reco && (
                  <>
                    <p className="ai-rec"><b>✨ Recommend.</b> {reco.rationale}</p>
                    <div className="ai-impact">
                      <span>−{reco.effect?.delta_feels_like_c ?? "?"}°C</span>
                      <span>{(reco.effect?.people_helped ?? 0).toLocaleString()} people</span>
                      <span>{fmtINR(reco.effect?.cost_inr ?? 0)}</span>
                    </div>
                  </>
                )}
                <button className="plan-btn" onClick={openDrawer}>Plan &amp; simulate →</button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {drawer && (
        <div className="drawer">
          <div className="dr-head"><b>Plan a fix · {point?.area_name ?? "area"}</b><button onClick={() => setDrawer(false)}>✕</button></div>
          <div className="sim-title">Interventions</div>
          <div className="palette">
            {PALETTE.map((p) => (
              <div key={p.key} className={mix[p.key] ? "pchip on" : "pchip"}>
                <span className="pl">{p.label}</span>
                <div className="step"><button onClick={() => bump(p.key, -p.step)}>−</button><span>{mix[p.key] || 0}</span><button onClick={() => bump(p.key, p.step)}>+</button></div>
              </div>
            ))}
          </div>
          <label className="budget"><span>Budget {fmtINR(budget)}</span><input type="range" min={0} max={1000000} step={25000} value={budget} onChange={(e) => setBudget(+e.target.value)} /></label>
          <button className="simbtn" onClick={runSim} disabled={simBusy}>{simBusy ? "Simulating…" : "Simulate cooling"}</button>
          {sim && (
            <div className="sim-res">
              <div className="sr-temp"><span className="from">{sim.baseline_feels_like_c?.toFixed(0)}°</span><span>→</span><span className="to">{sim.projected_feels_like_c?.toFixed(0)}°</span><span className="drop">−{sim.delta_feels_like_c.toFixed(1)}°C</span></div>
              <div className="sr-stats"><div className="stat"><b>{sim.people_helped.toLocaleString()}</b><span>people</span></div><div className={sim.over_budget ? "stat over" : "stat"}><b>{fmtINR(sim.cost_inr)}</b><span>{sim.over_budget ? "over budget" : "cost"}</span></div></div>
              <div className="risks"><b>What could go wrong</b><ul>{sim.what_could_go_wrong.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
              <button className="propbtn" onClick={runProposal} disabled={propBusy}>{propBusy ? "Drafting…" : "📄 Generate proposal"}</button>
            </div>
          )}
        </div>
      )}

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
