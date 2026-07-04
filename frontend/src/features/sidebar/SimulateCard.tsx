import { useClimaStore } from "../../store/useClimaStore";
import { HAZARD_META } from "../hazards/hazardMeta";
import { PALETTE } from "../simulation/palette";
import { fmtINR, fmtInt } from "../../lib/format";

const BAR_MAX = 50; // °C scale for the before/after bars

export default function SimulateCard() {
  const hazard = useClimaStore((s) => s.hazard);
  const mix = useClimaStore((s) => s.mix);
  const bump = useClimaStore((s) => s.bump);
  const budget = useClimaStore((s) => s.budget);
  const setBudget = useClimaStore((s) => s.setBudget);
  const sim = useClimaStore((s) => s.sim);
  const simBusy = useClimaStore((s) => s.simBusy);
  const simError = useClimaStore((s) => s.simError);
  const runSim = useClimaStore((s) => s.runSim);
  const reco = useClimaStore((s) => s.reco);
  const loadRecoIntoMix = useClimaStore((s) => s.loadRecoIntoMix);
  const scenarios = useClimaStore((s) => s.scenarios);
  const saveScenario = useClimaStore((s) => s.saveScenario);
  const clearScenarios = useClimaStore((s) => s.clearScenarios);

  const meta = HAZARD_META[hazard];
  const count = Object.values(mix).reduce((a, b) => a + (b || 0), 0);
  const pct = (t?: number) => (t == null ? 0 : Math.max(6, Math.min(100, (t / BAR_MAX) * 100)));

  return (
    <section className="card">
      <div className="card-head">
        <span className="mono-label">Simulate Intervention</span>
        <span className="iv-count">{count ? `${fmtInt(count)} placed` : "none yet"}</span>
      </div>

      {reco && (
        <button className="reco-btn" onClick={loadRecoIntoMix}>✨ Load AI recommended mix</button>
      )}

      <div className="palette">
        {PALETTE.map((p) => (
          <div key={p.key} className={mix[p.key] ? "pchip on" : p.hazards.includes(hazard) ? "pchip sug" : "pchip"}>
            <div className="pchip-l"><b>{p.label}</b><span>{p.note}</span></div>
            <div className="stepper">
              <button onClick={() => bump(p.key, -p.step)} aria-label={`less ${p.label}`}>&#8722;</button>
              <span className="mono">{mix[p.key] || 0}</span>
              <button onClick={() => bump(p.key, p.step)} aria-label={`more ${p.label}`}>+</button>
            </div>
          </div>
        ))}
      </div>

      <label className="budget">
        <span>Budget <b className="mono">{fmtINR(budget)}</b></span>
        <input className="tl-range" type="range" min={0} max={1000000} step={25000} value={budget} onChange={(e) => setBudget(+e.target.value)} />
      </label>

      <button className="primary-btn sim-btn" onClick={runSim} disabled={simBusy || !count}>
        {simBusy ? "Simulating…" : meta.simulateVerb}
      </button>
      {simError && !simBusy && (
        <div className="inline-err">Simulation failed — <button onClick={runSim}>try again</button></div>
      )}

      {sim && (
        <div className="sim-res">
          <div className="ba-bars">
            <div className="ba">
              <div className="ba-lbl"><span>Before</span><span className="mono">{sim.baseline_feels_like_c?.toFixed(1)}°C</span></div>
              <div className="ba-track"><div className="ba-fill before" style={{ width: `${pct(sim.baseline_feels_like_c)}%` }} /></div>
            </div>
            <div className="ba">
              <div className="ba-lbl"><span>After</span><span className="mono good">{sim.projected_feels_like_c?.toFixed(1)}°C</span></div>
              <div className="ba-track"><div className="ba-fill after" style={{ width: `${pct(sim.projected_feels_like_c)}%` }} /></div>
            </div>
          </div>
          <div className="sim-stats">
            <div className="stat"><b>−{sim.delta_feels_like_c.toFixed(1)}°C</b><span>feels-like</span></div>
            <div className="stat"><b>{fmtInt(sim.people_helped)}</b><span>people</span></div>
            <div className={sim.over_budget ? "stat over" : "stat"}><b>{fmtINR(sim.cost_inr)}</b><span>{sim.over_budget ? "over budget" : "cost"}</span></div>
          </div>
          {sim.people_helped > 0 && sim.cost_inr > 0 && (
            <div className="roi">
              <span>ROI</span>
              <b className="mono">{fmtINR(Math.round(sim.cost_inr / sim.people_helped))}<small>/person</small></b>
              <b className="mono">{(sim.delta_feels_like_c / (sim.cost_inr / 100000)).toFixed(2)}<small>°C / ₹L</small></b>
            </div>
          )}
          {sim.people_helped > 0 && sim.delta_feels_like_c > 0 && (
            <div className="roi">
              <span>Cost-effectiveness</span>
              <b>{fmtINR(sim.cost_inr / sim.people_helped)}<small>/ person</small></b>
              <b>{fmtINR(sim.cost_inr / (sim.delta_feels_like_c * Math.max(1, sim.people_helped / 1000)))}<small>/ °C·1k</small></b>
            </div>
          )}
          {(sim.air_quality_change || sim.flood_change) && (
            <div className="cobenefit">
              {sim.air_quality_change && <span>{sim.air_quality_change}</span>}
              {sim.flood_change && <span>{sim.flood_change}</span>}
            </div>
          )}
          {sim.what_could_go_wrong?.length > 0 && (
            <div className="risks"><b>What could go wrong</b><ul>{sim.what_could_go_wrong.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
          )}
        </div>
      )}

      {(() => {
        const A = scenarios.A, B = scenarios.B;
        const eff = (s: typeof A) => (s && s.cost > 0 ? s.delta / (s.cost / 100000) : 0);
        const winner = A && B ? (eff(A) >= eff(B) ? "A" : "B") : null;
        return (
          <div className="scenario-compare">
            <div className="sc-head">
              <span className="mono-label">Scenario compare</span>
              {(A || B) && <button className="sc-clear" onClick={clearScenarios}>Clear</button>}
            </div>
            <div className="sc-save">
              <button onClick={() => saveScenario("A")} disabled={!sim}>Save as A</button>
              <button onClick={() => saveScenario("B")} disabled={!sim}>Save as B</button>
            </div>
            {(A || B) && (
              <table className="sc-table">
                <thead><tr><th></th><th className={winner === "A" ? "win" : ""}>A</th><th className={winner === "B" ? "win" : ""}>B</th></tr></thead>
                <tbody>
                  <tr><td>Area</td><td>{A?.label ?? "—"}</td><td>{B?.label ?? "—"}</td></tr>
                  <tr><td>Δ feels-like</td><td>{A ? `−${A.delta.toFixed(1)}°C` : "—"}</td><td>{B ? `−${B.delta.toFixed(1)}°C` : "—"}</td></tr>
                  <tr><td>People</td><td>{A ? fmtInt(A.people) : "—"}</td><td>{B ? fmtInt(B.people) : "—"}</td></tr>
                  <tr><td>Cost</td><td>{A ? fmtINR(A.cost) : "—"}</td><td>{B ? fmtINR(B.cost) : "—"}</td></tr>
                </tbody>
              </table>
            )}
            {A && B && <div className="sc-verdict">Best cooling per ₹: <b>Scenario {winner}</b></div>}
          </div>
        );
      })()}
    </section>
  );
}
