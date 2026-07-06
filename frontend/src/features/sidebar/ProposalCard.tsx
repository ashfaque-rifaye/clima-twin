import { useState, type FormEvent } from "react";
import { useClimaStore } from "../../store/useClimaStore";
import { fmtINR, fmtInt, mdToHtml } from "../../lib/format";
import { useLoadingSteps } from "../../lib/useLoadingSteps";

const RECO_STEPS = [
  "Loading environmental datasets…",
  "Estimating intervention…",
  "Scoring benefit per rupee…",
  "Drafting recommendation…",
];

function download(name: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProposalCard() {
  const point = useClimaStore((s) => s.point);
  const reco = useClimaStore((s) => s.reco);
  const recoBusy = useClimaStore((s) => s.recoBusy);
  const prop = useClimaStore((s) => s.prop);
  const propBusy = useClimaStore((s) => s.propBusy);
  const runProposal = useClimaStore((s) => s.runProposal);
  const askAnswer = useClimaStore((s) => s.askAnswer);
  const askBusy = useClimaStore((s) => s.askBusy);
  const runAsk = useClimaStore((s) => s.runAsk);
  const clearAsk = useClimaStore((s) => s.clearAsk);

  const propError = useClimaStore((s) => s.propError);
  const [q, setQ] = useState("");
  const recoStep = useLoadingSteps(recoBusy && !reco, RECO_STEPS);
  const effect = prop ? undefined : reco?.effect;
  const body = prop?.markdown
    ?? reco?.rationale
    ?? point?.prediction
    ?? (recoBusy ? "Generating recommendation…" : "Select a location to see the AI recommendation.");

  const onAsk = (e: FormEvent) => { e.preventDefault(); if (q.trim()) runAsk(q); };

  return (
    <section className="ai-card">
      <div className="ai-head">
        <div className="ai-mark" aria-hidden><span /></div>
        <span className="mono-label light">AI Proposal · Gemini</span>
      </div>

      {point?.prediction && !prop && <p className="ai-fore"><b>Forecast.</b> {point.prediction}</p>}
      {prop
        ? <div className="ai-body ai-md" dangerouslySetInnerHTML={{ __html: mdToHtml(prop.markdown) }} />
        : recoBusy && !reco
          ? (
            <div className="ai-body">
              <div className="skel skel-line" style={{ width: "92%" }} />
              <div className="skel skel-line" style={{ width: "84%" }} />
              <div className="skel skel-line" style={{ width: "70%" }} />
              <div className="load-steps">{recoStep}</div>
            </div>
          )
          : <div className="ai-body">{body}</div>}
      {propError && <div className="inline-err">Proposal generation failed — <button onClick={runProposal}>try again</button></div>}

      {effect && (
        <div className="ai-chips">
          <div className="ai-chip"><div className="mono-mini">Δ FEELS-LIKE</div><b>−{effect.delta_feels_like_c ?? "?"}°C</b></div>
          <div className="ai-chip"><div className="mono-mini">PEOPLE</div><b>{fmtInt(effect.people_helped ?? 0)}</b></div>
          <div className="ai-chip"><div className="mono-mini">COST</div><b>{fmtINR(effect.cost_inr ?? 0)}</b></div>
        </div>
      )}

      <div className="ai-actions">
        <button
          className="ai-export"
          onClick={() => (prop ? download("climatwin-proposal.md", prop.markdown) : runProposal())}
          disabled={propBusy}
        >
          {propBusy ? "Drafting…" : prop ? "Download .md" : "Export proposal"}
        </button>
        <button className="ai-regen" onClick={runProposal} disabled={propBusy}>Regenerate</button>
      </div>

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
