import { useClimaStore } from "../../store/useClimaStore";
import { HAZARD_META } from "../hazards/hazardMeta";
import { aqiBand, diurnalDeltaC, hourLabel, ndviLabel } from "../../lib/format";

export default function MicroclimateCard() {
  const point = useClimaStore((s) => s.point);
  const hazard = useClimaStore((s) => s.hazard);
  const hour = useClimaStore((s) => s.hour);
  const pointBusy = useClimaStore((s) => s.pointBusy);
  const pointError = useClimaStore((s) => s.pointError);
  const retryPoint = useClimaStore((s) => s.retryPoint);
  const meta = HAZARD_META[hazard];
  const v = point?.vulnerability;

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
        <div className="mc-hero-val" style={{ color: heroColor }}>
          {pointBusy && !point?.live ? "\u2026" : heroValue}
        </div>
        <div className="mc-hero-meta">
          <b>{heroLabel}</b>
          <span>{heroSub}</span>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <span className="metric-k mono">NDVI</span>
          <span className="metric-v" style={{ color: "var(--ct-good)" }}>{v?.ndvi ?? "\u2014"}</span>
          <span className="metric-s">{ndviLabel(v?.ndvi)}</span>
        </div>
        <div className="metric">
          <span className="metric-k mono">AQI</span>
          <span className={`metric-v aqi-${aqiBand(point?.air?.aqi)}`}>{point?.air?.aqi ?? "\u2014"}</span>
          <span className="metric-s">{point?.air?.dominant ?? point?.air?.category ?? "\u2014"}</span>
        </div>
        <div className="metric">
          <span className="metric-k mono">Flood</span>
          <span className="metric-v" style={{ color: "var(--ct-flood)", textTransform: "capitalize" }}>{point?.flood?.risk ?? "\u2014"}</span>
          <span className="metric-s">{point?.flood?.rain_prob ?? 0}% rain</span>
        </div>
      </div>

      <div className="mc-foot mono">
        Elevation {point?.elevation_m != null ? `${point.elevation_m.toFixed(0)} m` : "\u2014"}{" \u00B7 "}{point?.source ?? "\u2014"}
      </div>
      {pointError && !pointBusy && (
        <div className="inline-err">Live data unavailable for this point \u2014 <button onClick={retryPoint}>retry</button></div>
      )}
    </section>
  );
}
