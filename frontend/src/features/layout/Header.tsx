// Light 58px top bar — brand, location search, hazard toggle, view toggle, Share.
import { useState, type FormEvent } from "react";
import { useClimaStore } from "../../store/useClimaStore";
import { HAZARDS, HAZARD_META } from "../hazards/hazardMeta";
import { coordText } from "../../lib/format";

type LatLng = { lat: () => number; lng: () => number };
type GeocodeRes = { results?: Array<{ geometry?: { location?: LatLng } }> };
type MapsGlobal = { maps?: { Geocoder?: new () => { geocode: (r: { address: string }) => Promise<GeocodeRes> } } };

export default function Header() {
  const hazard = useClimaStore((s) => s.hazard);
  const setHazard = useClimaStore((s) => s.setHazard);
  const point = useClimaStore((s) => s.point);
  const view = useClimaStore((s) => s.view);
  const setView = useClimaStore((s) => s.setView);
  const select = useClimaStore((s) => s.select);
  const [q, setQ] = useState("");

  const onSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    const g = (window as unknown as { google?: MapsGlobal }).google;
    if (!g?.maps?.Geocoder) return;
    try {
      const { results } = await new g.maps.Geocoder().geocode({ address: `${q}, Chennai, Tamil Nadu` });
      const loc = results?.[0]?.geometry?.location;
      if (loc) void select(loc.lat(), loc.lng());
    } catch { /* no match */ }
  };

  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-logo" aria-hidden><span /></div>
        <div className="brand-txt">
          <div className="brand-name">ClimaTwin</div>
          <div className="brand-sub">Microclimate Decision Engine</div>
        </div>
      </div>

      <form className="search" onSubmit={onSearch} role="search">
        <span className="search-ic" aria-hidden>⌕</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={point?.area_name ? `${point.area_name}, Tamil Nadu` : "Search a place in Chennai…"}
          aria-label="Search location"
        />
        {point && <span className="search-coord mono">{coordText(point.lat, point.lng)}</span>}
      </form>

      <div className="hazard-toggle" role="tablist" aria-label="Hazard layer">
        {HAZARDS.map((id) => {
          const m = HAZARD_META[id];
          const on = hazard === id;
          return (
            <button key={id} role="tab" aria-selected={on} className={on ? "hz on" : "hz"}
              style={on ? { background: m.color, color: "#fff" } : undefined} onClick={() => setHazard(id)}>
              <span className="hz-dot" style={{ background: on ? "#fff" : m.color }} />{m.label}
            </button>
          );
        })}
      </div>

      <div className="view-toggle" role="tablist" aria-label="View">
        <button role="tab" aria-selected={view === "planner"} className={view === "planner" ? "on" : ""} onClick={() => setView("planner")}>Planner</button>
        <button role="tab" aria-selected={view === "citizen"} className={view === "citizen" ? "on" : ""} onClick={() => setView("citizen")}>Citizen</button>
      </div>

      <button className="share-btn">Share</button>
    </header>
  );
}
