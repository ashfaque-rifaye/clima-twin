import { useClimaStore } from "../../store/useClimaStore";
import { HAZARD_META } from "../hazards/hazardMeta";
import { PALETTE } from "../simulation/palette";
import type { InterventionItem, Impacts } from "../../services/api";
import { fmtINR, fmtInt } from "../../lib/format";

const BAR_MAX = 50; // °C scale for the before/after bars
const PRESETS: [number, string][] = [[5_000_000, "₹50L"], [20_000_000, "₹2Cr"], [100_000_000, "₹10Cr"]];

// The headline metric shown per hazard (Part 6).
function primaryStat(hazard: string, imp?: Impacts): { value: string; label: string } {
  if (!imp) return { value: "—", label: "impact" };
  if (hazard === "air") return { value: `${imp.aqi_improvement} ↓`, label: "AQI improved" };
  if (hazard === "flood") return { value: fmtInt(imp.flood_managed_m3), label: "m³ managed" };
  if (hazard === "green") return { value: fmtInt(imp.canopy_added_m2), label: "m² green added" };
  return { value: `−${imp.temp_reduction_c}°C`, label: "feels-like" };
}

// Which impact rows to surface (non-zero only).
function impactRows(imp: Impacts): [string, string][] {
  const rows: [string, string][] = [];
  if (imp.temp_reduction_c) rows.push([`−${imp.temp_reduction_c}°C`, "cooling"]);
  if (imp.aqi_improvement) rows.push([`${imp.aqi_improvement}`, "AQI ↓"]);
  if (imp.flood_managed_m3) rows.push([`${fmtInt(imp.flood_managed_m3)}`, "m³ flood"]);
  if (imp.canopy_added_m2) rows.push([`${fmtInt(imp.canopy_added_m2)}`, "m² green"]);
  if (imp.carbon_seq_kg_year) rows.push([`${fmtInt(imp.carbon_seq_kg_year)}`, "kg CO₂/yr"]);
  if (imp.water_retention_l) rows.push([`${fmtInt(Math.abs(imp.water_retention_l))}`, imp.water_retention_l < 0 ? "L water used" : "L retained"]);
  return rows;
}

export default function SimulateCard() {
  const hazard = useClimaStore((s) => s.hazard);
  const catalogue = useClimaStore((s) => s.catalogue);
  const mix = useClimaStore((s) => s.mix);
  const bump = useClimaStore((s) => s.bump);
  const budget = useClimaStore((s) => s.budget);
  const setBudget = useClimaStore((s) => s.setBudget);
  const budgetMode = useClimaStore((s) => s.budgetMode);
  const setBudgetMode = useClimaStore((s) => s.setBudgetMode);
  const sim = useClimaStore((s) => s.sim);
  const simBusy = useClimaStore((s) => s.simBusy);
  const simError = useClimaStore((s) => s.simError);
  const runSim = useClimaStore((s) => s.runSim);
  const opt = useClimaStore((s) => s.opt);
  const optBusy = useClimaStore((s) => s.optBusy);
  const optError = useClimaStore((s) => s.optError);
  const runOptimize = useClimaStore((s) => s.runOptimize);
  const selected = useClimaStore((s) => s.selected);
  const reco = useClimaStore((s) => s.reco);
  const loadRecoIntoMix = useClimaStore((s) => s.loadRecoIntoMix);
  const scenarios = useClimaStore((s) => s.scenarios);
  const saveScenario = useClimaStore((s) => s.saveScenario);
  const clearScenarios = useClimaStore((s) => s.clearScenarios);

  const meta = HAZARD_META[hazard];
  const count = Object.values(mix).reduce((a, b) => a + (b || 0), 0);
  const pct = (t?: number) => (t == null ? 0 : Math.max(6, Math.min(100, (t / BAR_MAX) * 100)));

  // Per-hazard catalogue, with a graceful fallback to the static palette.
  const items: InterventionItem[] = catalogue.length
    ? catalogue
    : PALETTE.filter((p) => p.hazards.includes(hazard)).map((p) => ({
        key: p.key, name: p.label, type: p.type, unit: "unit", step: p.step, note: p.note,
        capital_inr: 0, maintenance_inr_year: 0, primary_metric: "", primary_coefficient: 0, co_benefits: [],
      }));

  const head = primaryStat(hazard, sim?.impacts);

  return (
    <section className="card">
      <div className="card-head">
        <span className="mono-label">Simulate Intervention</span>
        <span className="iv-count">{count ? `${fmtInt(count)} placed` : "none yet"}</span>
      </div>

      <div className="bmode">
        <button className={budgetMode === "manual" ? "bmode-b on" : "bmode-b"} onClick={() => setBudgetMode("manual")}>Manual mix</button>
        <button className={budgetMode === "optimize" ? "bmode-b on" : "bmode-b"} onClick={() => setBudgetMode("optimize")}>AI budget plan</button>
      </div>

      {reco && budgetMode === "manual" && (
        <button className="reco-btn" onClick={loadRecoIntoMix}>✨ Load AI recommended mix</button>
      )}

      <div className="palette">
        {items.map((p) => (
          <div key={p.key} className={mix[p.key] ? "pchip on" : "pchip"}>
            <div className="pchip-l"><b>{p.name}</b><span>{p.note}</span></div>
            <div className="stepper">
              <button onClick={() => bump(p.key, -p.step)} aria-label={`less ${p.name}`}>&#8722;</button>
              <span className="mono">{mix[p.key] || 0}</span>
              <button onClick={() => bump(p.key, p.step)} aria-label={`more ${p.name}`}>+</button>
            </div>
          </div>
        ))}
      </div>

      <label className="budget">
        <span>Budget <b className="mono">{fmtINR(budget)}</b></span>
        <input className="tl-range" type="range" min={0} max={100000000} step={500000} value={budget} onChange={(e) => setBudget(+e.target.value)} />
      </label>
      {budgetMode === "optimize" && (
        <div className="bpresets">
          {PRESETS.map(([v, l]) => (
            <button key={l} className={budget === v ? "bpreset on" : "bpreset"} onClick={() => setBudget(v)}>{l}</button>
          ))}
        </div>
      )}

      {budgetMode === "optimize" ? (
        <button className="primary-btn sim-btn" onClick={runOptimize} disabled={optBusy || !selected}>
          {optBusy ? "Optimising…" : "Generate optimal plan"}
        </button>
      ) : (
        <button className="primary-btn sim-btn" onClick={runSim} disabled={simBusy || !count}>
          {simBusy ? "Simulating…" : meta.simulateVerb}
        </button>
      )}
      {simError && !simBusy && (
        <div className="inline-err">Simulation failed — <button onClick={runSim}>try again</button></div>
      )}
      {optError && !optBusy && (
        <div className="inline-err">Optimisation failed — <button onClick={runOptimize}>try again</button></div>
      )}

      {budgetMode === "optimize" && opt && opt.interventions.length > 0 && (
        <div className="opt-res">
          <div className="opt-plan">
            {opt.interventions.map((i, k) => (
              <div className="opt-row" key={k}>
                <div className="opt-l"><b>{fmtInt(i.count)}× {i.name}</b><span>{i.why}</span></div>
                <span className="mono">{fmtINR(i.capital_inr)}</span>
              </div>
            ))}
          </div>
          <div className="opt-budget">
            <span>Used <b className="mono">{fmtINR(opt.budget.allocated_inr)}</b> · {opt.budget.utilization_pct}%</span>
            <span className={opt.budget.over_budget ? "over" : ""}>Left <b className="mono">{fmtINR(opt.budget.remaining_inr)}</b></span>
          </div>
          {opt.rationale && <p className="opt-why">{opt.rationale}</p>}
          {opt.assumptions?.length > 0 && (
            <details className="opt-assume"><summary>Assumptions</summary><ul>{opt.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></details>
          )}
          <button className="reco-btn" onClick={runSim} disabled={simBusy}>{simBusy ? "Simulating…" : "Simulate this plan"}</button>
        </div>
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
            <div className="stat"><b>{head.value}</b><span>{head.label}</span></div>
            <div className="stat"><b>{fmtInt(sim.people_helped)}</b><span>people</span></div>
            <div className={sim.over_budget ? "stat over" : "stat"}><b>{fmtINR(sim.cost_inr)}</b><span>{sim.over_budget ? "over budget" : "capital"}</span></div>
          </div>
          {sim.impacts && (
            <div className="impact-grid">
              {impactRows(sim.impacts).map(([v, l], i) => (
                <div className="imp" key={i}><b>{v}</b><span>{l}</span></div>
              ))}
            </div>
          )}
          {sim.costs && (
            <div className="cost-line">
              <span>Maint/yr <b className="mono">{fmtINR(sim.costs.maintenance_inr_year)}</b></span>
              <span>5-yr <b className="mono">{fmtINR(sim.costs.five_year_inr)}</b></span>
              <span>10-yr <b className="mono">{fmtINR(sim.costs.ten_year_inr)}</b></span>
            </div>
          )}
          {sim.people_helped > 0 && sim.cost_inr > 0 && (
            <div className="roi">
              <span>ROI</span>
              <b className="mono">{fmtINR(Math.round(sim.cost_inr / sim.people_helped))}<small>/person</small></b>
              {sim.delta_feels_like_c > 0 && (
                <b className="mono">{(sim.delta_feels_like_c / (sim.cost_inr / 100000)).toFixed(2)}<small>°C / ₹L</small></b>
              )}
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
        const { A, B, C } = scenarios;
        const val = (s: typeof A) => (s && s.cost > 0 ? s.people / s.cost : 0);
        const slots = [["A", A], ["B", B], ["C", C]] as const;
        const filled = slots.filter(([, s]) => s);
        const winner = filled.length >= 2
          ? filled.reduce((best, cur) => (val(cur[1]) > val(best[1]) ? cur : best))[0]
          : null;
        const cell = (s: typeof A, f: (x: NonNullable<typeof A>) => string) => (s ? f(s) : "—");
        return (
          <div className="scenario-compare">
            <div className="sc-head">
              <span className="mono-label">Scenario compare</span>
              {(A || B || C) && <button className="sc-clear" onClick={clearScenarios}>Clear</button>}
            </div>
            <div className="sc-save">
              <button onClick={() => saveScenario("A")} disabled={!sim}>Save as A</button>
              <button onClick={() => saveScenario("B")} disabled={!sim}>Save as B</button>
              <button onClick={() => saveScenario("C")} disabled={!sim}>Save as C</button>
            </div>
            {(A || B || C) && (
              <table className="sc-table">
                <thead><tr><th></th>{slots.map(([k]) => <th key={k} className={winner === k ? "win" : ""}>{k}</th>)}</tr></thead>
                <tbody>
                  <tr><td>Area</td>{slots.map(([k, s]) => <td key={k}>{cell(s, (x) => x.label)}</td>)}</tr>
                  <tr><td>Δ feels-like</td>{slots.map(([k, s]) => <td key={k}>{cell(s, (x) => `−${x.delta.toFixed(1)}°C`)}</td>)}</tr>
                  <tr><td>AQI ↓</td>{slots.map(([k, s]) => <td key={k}>{cell(s, (x) => (x.aqi ? `${x.aqi}` : "—"))}</td>)}</tr>
                  <tr><td>Flood m³</td>{slots.map(([k, s]) => <td key={k}>{cell(s, (x) => (x.flood ? fmtInt(x.flood) : "—"))}</td>)}</tr>
                  <tr><td>Canopy m²</td>{slots.map(([k, s]) => <td key={k}>{cell(s, (x) => (x.canopy ? fmtInt(x.canopy) : "—"))}</td>)}</tr>
                  <tr><td>People</td>{slots.map(([k, s]) => <td key={k}>{cell(s, (x) => fmtInt(x.people))}</td>)}</tr>
                  <tr><td>Capital</td>{slots.map(([k, s]) => <td key={k}>{cell(s, (x) => fmtINR(x.cost))}</td>)}</tr>
                  <tr><td>Maint/yr</td>{slots.map(([k, s]) => <td key={k}>{cell(s, (x) => (x.maintenance ? fmtINR(x.maintenance) : "—"))}</td>)}</tr>
                </tbody>
              </table>
            )}
            {winner && <div className="sc-verdict">Best value (people per ₹): <b>Scenario {winner}</b></div>}
          </div>
        );
      })()}
    </section>
  );
}
