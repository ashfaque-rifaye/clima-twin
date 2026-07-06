import { useEffect, useState, type FormEvent } from "react";
import { useClimaStore } from "../../store/useClimaStore";
import { fmtINR, fmtInt } from "../../lib/format";
import { useLoadingSteps } from "../../lib/useLoadingSteps";

const RECO_STEPS = [
  "Loading environmental datasets…",
  "Estimating intervention…",
  "Scoring benefit per rupee…",
  "Drafting recommendation…",
];

// Part 9 — the premium report-generation workflow.
const REPORT_STEPS = [
  "Analysing scenario",
  "Generating maps",
  "Estimating impacts",
  "Building charts",
  "Writing executive summary",
  "Compiling report",
  "Exporting document",
];

export default function ProposalCard() {
  const point = useClimaStore((s) => s.point);
  const reco = useClimaStore((s) => s.reco);
  const recoBusy = useClimaStore((s) => s.recoBusy);
  const sim = useClimaStore((s) => s.sim);
  const opt = useClimaStore((s) => s.opt);
  const reportBusy = useClimaStore((s) => s.reportBusy);
  const reportError = useClimaStore((s) => s.reportError);
  const reportHtml = useClimaStore((s) => s.reportHtml);
  const reportTitle = useClimaStore((s) => s.reportTitle);
  const runReport = useClimaStore((s) => s.runReport);
  const openReport = useClimaStore((s) => s.openReport);
  const downloadReportDocx = useClimaStore((s) => s.downloadReportDocx);
  const askAnswer = useClimaStore((s) => s.askAnswer);
  const askBusy = useClimaStore((s) => s.askBusy);
  const runAsk = useClimaStore((s) => s.runAsk);
  const clearAsk = useClimaStore((s) => s.clearAsk);

  const [q, setQ] = useState("");
  const recoStep = useLoadingSteps(recoBusy && !reco, RECO_STEPS);
  const hasPlan = !!(sim || opt);

  // advance the 7-step progress while the report request is in flight
  const [rstep, setRstep] = useState(0);
  useEffect(() => {
    if (!reportBusy) return;
    setRstep(0);
    const t = setInterval(() => setRstep((s) => Math.min(s + 1, REPORT_STEPS.length - 1)), 900);
    return () => clearInterval(t);
  }, [reportBusy]);

  const effect = reco?.effect;
  const body = reco?.rationale
    ?? point?.prediction
    ?? (recoBusy ? "Generating recommendation…" : "Select a location to see the AI recommendation.");

  const onAsk = (e: FormEvent) => { e.preventDefault(); if (q.trim()) runAsk(q); };

  return (
    <section className="ai-card">
      <div className="ai-head">
        <div className="ai-mark" aria-hidden><span /></div>
        <span className="mono-label light">AI Planning Report · Gemini</span>
      </div>

      {point?.prediction && <p className="ai-fore"><b>Forecast.</b> {point.prediction}</p>}
      {recoBusy && !reco
        ? (
          <div className="ai-body">
            <div className="skel skel-line" style={{ width: "92%" }} />
            <div className="skel skel-line" style={{ width: "84%" }} />
            <div className="skel skel-line" style={{ width: "70%" }} />
            <div className="load-steps">{recoStep}</div>
          </div>
        )
        : <div className="ai-body">{body}</div>}

      {effect && (
        <div className="ai-chips">
          <div className="ai-chip"><div className="mono-mini">Δ FEELS-LIKE</div><b>−{effect.delta_feels_like_c ?? "?"}°C</b></div>
          <div className="ai-chip"><div className="mono-mini">PEOPLE</div><b>{fmtInt(effect.people_helped ?? 0)}</b></div>
          <div className="ai-chip"><div className="mono-mini">COST</div><b>{fmtINR(effect.cost_inr ?? 0)}</b></div>
        </div>
      )}

      {reportBusy ? (
        <div className="report-flow">
          {REPORT_STEPS.map((label, i) => (
            <div key={i} className={i < rstep ? "rf-step done" : i === rstep ? "rf-step active" : "rf-step"}>
              <span className="rf-dot" />{label}
            </div>
          ))}
        </div>
      ) : reportHtml ? (
        <div className="report-ready">
          <div className="rr-title">✓ {reportTitle ?? "Planning report"} ready</div>
          <div className="rr-actions">
            <button className="ai-export" onClick={openReport}>Open · Print PDF</button>
            <button className="ai-regen" onClick={downloadReportDocx}>Word</button>
          </div>
          <button className="rr-regen" onClick={runReport}>Regenerate report</button>
        </div>
      ) : (
        <div className="ai-actions">
          <button className="ai-export" onClick={runReport} disabled={!hasPlan}>
            {hasPlan ? "Generate planning report" : "Simulate a plan first"}
          </button>
        </div>
      )}
      {reportError && !reportBusy && (
        <div className="inline-err">Report generation failed — <button onClick={runReport}>try again</button></div>
      )}

      <form className="ai-ask" onSubmit={onAsk}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask ClimaTwin…" aria-label="Ask ClimaTwin" />
        <button disabled={askBusy}>{askBusy ? "…" : "Ask"}</button>
      </form>
      {askAnswer && (
        <div className="ai-answer"><span>{askAnswer}</span><button onClick={clearAsk} aria-label="dismiss">×</button></div>
      )}
    </section>
  );
}
