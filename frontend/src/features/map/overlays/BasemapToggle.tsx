import { useClimaStore } from "../../../store/useClimaStore";

const OPTIONS: { id: "map" | "satellite"; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "satellite", label: "Satellite" },
];

export default function BasemapToggle() {
  const basemap = useClimaStore((s) => s.basemap);
  const setBasemap = useClimaStore((s) => s.setBasemap);
  return (
    <div className="basemap-toggle glass-card">
      {OPTIONS.map((o) => (
        <button key={o.id} className={basemap === o.id ? "bm on" : "bm"} onClick={() => setBasemap(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
