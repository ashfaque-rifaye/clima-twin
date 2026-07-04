import { useClimaStore } from "../../../store/useClimaStore";
import { HAZARD_META } from "../../hazards/hazardMeta";
import { coordText } from "../../../lib/format";

export default function SelectedZoneCard() {
  const point = useClimaStore((s) => s.point);
  const hazard = useClimaStore((s) => s.hazard);
  const meta = HAZARD_META[hazard];
  if (!point) return null;
  const blind = point.vulnerability?.data_blind_spot;
  return (
    <div className="zone-card">
      <div className="glass-card zc-body">
        <div className="zc-head">
          <span className="zc-dot" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
          <span className="mono-label">{meta.label} · Selected Zone</span>
        </div>
        <div className="zc-name">{point.area_name ?? "Selected cell"}</div>
        <div className="zc-coord mono">{coordText(point.lat, point.lng)}</div>
        {blind && (
          <div className="chip-blind">
            <span className="blink-dot" /> DATA BLIND SPOT
          </div>
        )}
      </div>
      <div className="zc-hint mono">&#9678; Click the map to relocate</div>
    </div>
  );
}
