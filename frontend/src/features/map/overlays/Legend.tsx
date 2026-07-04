import { useClimaStore } from "../../../store/useClimaStore";
import { HAZARD_META } from "../../hazards/hazardMeta";

export default function Legend() {
  const hazard = useClimaStore((s) => s.hazard);
  const l = HAZARD_META[hazard].legend;
  return (
    <div className="legend glass-card">
      <span className="mono-label">{l.title}</span>
      <span className="legend-end mono">{l.lo}</span>
      <span className="legend-bar" style={{ background: l.gradient }} />
      <span className="legend-end mono">{l.hi}</span>
    </div>
  );
}
