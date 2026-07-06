import { useClimaStore } from "../../store/useClimaStore";
import { HAZARD_META } from "../hazards/hazardMeta";
import { aqiBand, diurnalDeltaC, hourLabel, ndviLabel } from "../../lib/format";
import { useLoadingSteps } from "../../lib/useLoadingSteps";

const LOAD_STEPS = [
  "Loading microclimate…",
  "Fetching live weather…",
  "Reading air quality…",
  "Sampling elevation…",
  "Resolving locality…",
];

/** Compact provenance summary: live API metrics vs model-derived. */
function srcSummary(sources?: Record<string, string>): { live: string[]; model: string[] } | null {
  if (!sources) return null;
  const live: string[] = [];
  const model: string[] = [];
  for (const [k, v] of Object.entries(sources)) {
    if (["heat", "air", "flood", "elevation"].includes(k)) {
      (v.includes("live") || v.includes("API") ? live : model).push(k);
    }
  }
  return { live, model };
}

export default function MicroclimateCard() {
  const point = useClimaStore((s) => s.point);
  const hazard = useClimaStore((s) => s.hazard);
  const hour = useClimaStore((s) => s.hour);
  const pointBusy = useClimaStore((s) => s.pointBusy);
  const pointError = useClimaStore((s) => s.pointError);
  const retryPoint = useClimaStore((s) => s.retryPoint);
  const meta = HAZARD_META[hazard];
  const v = point?.vulnerability;
  const loading = pointBusy && !point?.live;
  const step = useLoadingSteps(loading, LOAD_STEPS);
  const src = srcSummary(point?.sources);

  let heroValue = "\u2014";
  let heroLabel = meta.primaryLabel;
  let heroSub = "select a spot on the map";
  let heroColor = meta.color;

  if (point) {
    if (hazard === "heat" && point.heat?.feels_like_c != null) {
      const scenario = point.heat.feels_like_c + diurnalDeltaC(hour) - diurnalDeltaC(15);
      heroValue = `${scenario.toFixed(1)}\u00B0C`;
      heroLabel = "Land surface temp";
      heroSub = `Feels-like \u00B7 ${point.heat.condition ?? "live"} \u00B7 ${hourLabel(hour)}`;
    } else if (hazard === "flood") {
      heroValue = point.flood?.risk ? point.flood.risk.toUpperCase() : "\u2014";
      heroLabel = "Flood risk";
      heroSub = point.flood?.basis ?? `${point.flood?.rain_prob ?? 0}% rain in forecast`;
      heroColor = meta.color;
    } else if (hazard === "air") {
      heroValue = point.air?.aqi != null ? String(point.air.aqi) : "\u2014";
      heroLabel = "Air quality index";
      heroSub = point.air?.category ?? point.air?.dominant ?? "AQI signal";
    } else if (hazard === "green") {
      heroValue = v?.green_cover_pct != null ? `${v.green_cover_pct}%` : "\u2014";
      heroLabel = "Canopy cover";
      heroSub = v?.ndvi != null ? `NDVI ${v.ndvi} · vegetation` : "vegetation index";
    }
  }

  return (
    <section className="card mc-card">
      <div className="card-head">
        <span className="mono-label">Microclimate Analysis</span>
        <span className="card-head-meta mono">{hourLabel(hour)}</span>
      </div>

      <div className="mc-hero">
        {loading ? (
          <div className="skel skel-hero" aria-label="loading" />
        ) : (
          <div className="mc-hero-val" style={{ color: heroColor }}>{heroValue}</div>
        )}
        <div className="mc-hero-meta">
          <b>{heroLabel}</b>
          <span>{loading ? "querying live datasets" : heroSub}</span>
        </div>
      </div>
      {loading && <div className="load-steps">{step}</div>}

      <div className="metric-grid">
        <div className="metric">
          <span className="metric-k mono">NDVI</span>
          {loading ? <span className="skel skel-val" /> : <span className="metric-v" style={{ color: "var(--ct-good)" }}>{v?.ndvi ?? "\u2014"}</span>}
          <span className="metric-s">{loading ? "\u2026" : ndviLabel(v?.ndvi)}</span>
        </div>
        <div className="metric">
          <span className="metric-k mono">AQI</span>
          {loading ? <span className="skel skel-val" /> : <span className={`metric-v aqi-${aqiBand(point?.air?.aqi)}`}>{point?.air?.aqi ?? "\u2014"}</span>}
          <span className="metric-s">{loading ? "\u2026" : point?.air?.dominant ?? point?.air?.category ?? "\u2014"}</span>
        </div>
        <div className="metric">
          <span className="metric-k mono">Flood</span>
          {loading ? <span className="skel skel-val" /> : <span className="metric-v" style={{ color: "var(--ct-flood)", textTransform: "capitalize" }}>{point?.flood?.risk ?? "\u2014"}</span>}
          <span className="metric-s">{loading ? "\u2026" : `${point?.flood?.rain_prob ?? 0}% rain`}</span>
        </div>
      </div>

      <div className="mc-foot mono">
        Elevation {point?.elevation_m != null ? `${point.elevation_m.toFixed(0)} m` : "\u2014"}{" \u00B7 "}{point?.source ?? "\u2014"}
      </div>
      {src && !loading && (
        <div className="mc-src">
          {src.live.length > 0 && <><b>live:</b> {src.live.join(" \u00B7 ")}</>}
          {src.live.length > 0 && src.model.length > 0 && "  \u2014  "}
          {src.model.length > 0 && <>model: {src.model.join(" \u00B7 ")}</>}
        </div>
      )}
      {pointError && !pointBusy && (
        <div className="inline-err">Live data unavailable for this point \u2014 <button onClick={retryPoint}>retry</button></div>
      )}
    </section>
  );
}
