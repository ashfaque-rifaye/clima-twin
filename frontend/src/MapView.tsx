import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getGrid } from "./api";

const CHENNAI: [number, number] = [80.24, 13.06]; // [lng, lat]
const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const AQ_TYPE = "UAQI_RED_GREEN";

// glowing heatmap color ramps (by heatmap density)
const HEAT_COLOR: Record<string, maplibregl.ExpressionSpecification> = {
  heat: ["interpolate", ["linear"], ["heatmap-density"],
    0, "rgba(0,0,0,0)", 0.15, "#1fc39a", 0.35, "#f6c453", 0.6, "#ff8a3c", 0.8, "#ff3b30", 1, "#7a0010"],
  flood: ["interpolate", ["linear"], ["heatmap-density"],
    0, "rgba(0,0,0,0)", 0.15, "#9fe8ff", 0.4, "#3aa0ff", 0.7, "#2b6fff", 1, "#06104f"],
};

interface Props {
  apiKey: string;
  hazard: string;
  selected: { lat: number; lng: number } | null;
  onSelect: (lat: number, lng: number) => void;
}

export default function MapView({ apiKey, hazard, selected, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [loaded, setLoaded] = useState(false);
  const [is3d, setIs3d] = useState(true);

  // init map once
  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: STYLE,
      center: CHENNAI,
      zoom: 11,
      pitch: 50,
      bearing: -14,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on("load", () => { setLoaded(true); map.resize(); });
    map.on("click", (e) => onSelectRef.current(e.lngLat.lat, e.lngLat.lng));
    // container often isn't sized at init in this layout -> force resize until tiles load
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(ref.current);
    const timers = [200, 600, 1200, 2500].map((d) => window.setTimeout(() => map.resize(), d));
    return () => { ro.disconnect(); timers.forEach(clearTimeout); map.remove(); mapRef.current = null; };
  }, []);

  // hazard overlay: heat/flood -> heatmap layer; air -> Google AQ raster tiles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    for (const id of ["heat-layer", "aq-layer"]) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of ["grid", "aq"]) if (map.getSource(id)) map.removeSource(id);

    if (hazard === "air") {
      if (!apiKey) return;
      map.addSource("aq", { type: "raster", tiles: [`https://airquality.googleapis.com/v1/mapTypes/${AQ_TYPE}/heatmapTiles/{z}/{x}/{y}?key=${apiKey}`], tileSize: 256 });
      map.addLayer({ id: "aq-layer", type: "raster", source: "aq", paint: { "raster-opacity": 0.75 } });
      return;
    }

    let cancelled = false;
    getGrid(hazard).then((r) => {
      if (cancelled || !mapRef.current) return;
      const fc: maplibregl.GeoJSONSourceSpecification["data"] = {
        type: "FeatureCollection",
        features: r.points.map((p) => ({ type: "Feature", properties: { weight: p.weight }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })),
      };
      if (map.getSource("grid")) { (map.getSource("grid") as maplibregl.GeoJSONSource).setData(fc); return; }
      map.addSource("grid", { type: "geojson", data: fc });
      map.addLayer({
        id: "heat-layer", type: "heatmap", source: "grid",
        paint: {
          "heatmap-weight": ["get", "weight"],
          "heatmap-intensity": 1.25,
          "heatmap-radius": 60,
          "heatmap-opacity": 0.85,
          "heatmap-color": HEAT_COLOR[hazard] ?? HEAT_COLOR.heat,
        },
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [hazard, loaded, apiKey]);

  // selected marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.remove();
    markerRef.current = null;
    if (selected) markerRef.current = new maplibregl.Marker({ color: "#ff4d57" }).setLngLat([selected.lng, selected.lat]).addTo(map);
  }, [selected, loaded]);

  const toggle3d = (on: boolean) => { setIs3d(on); mapRef.current?.easeTo({ pitch: on ? 50 : 0, bearing: on ? -14 : 0, duration: 600 }); };

  return (
    <div className="mapview">
      <div ref={ref} style={{ width: "100%", height: "100%" }} />
      <div className="map-toggles">
        <button className={is3d ? "on" : ""} onClick={() => toggle3d(true)}>3D</button>
        <button className={!is3d ? "on" : ""} onClick={() => toggle3d(false)}>2D</button>
      </div>
    </div>
  );
}
