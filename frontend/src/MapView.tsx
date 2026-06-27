/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { getGrid } from "./api";

const CHENNAI = { lat: 13.06, lng: 80.24 };
const AQ_TYPE = "UAQI_RED_GREEN";

const RAMP: Record<string, string[]> = {
  heat: ["#1fc39a", "#8ed957", "#f6c453", "#ff8a3c", "#ff3b30", "#b00018"],
  flood: ["#bfeaff", "#7fd4ff", "#3aa0ff", "#2b6fff", "#1a3fd0", "#0a1f80"],
};
function colorFor(h: string, w: number) {
  const r = RAMP[h] ?? RAMP.heat;
  return r[Math.min(r.length - 1, Math.max(0, Math.floor(w * r.length)))];
}

function Overlay({ apiKey, hazard, selected }: { apiKey: string; hazard: string; selected: { lat: number; lng: number } | null }) {
  const map = useMap();
  const [points, setPoints] = useState<{ lat: number; lng: number; weight: number }[]>([]);

  useEffect(() => {
    if (hazard === "air") { setPoints([]); return; }
    let alive = true;
    getGrid(hazard).then((r) => { if (alive) setPoints(r.points); }).catch(() => setPoints([]));
    return () => { alive = false; };
  }, [hazard]);

  // heat / flood -> continuous field of soft circles from the live 64-pt grid
  useEffect(() => {
    if (!map || hazard === "air" || !points.length) return;
    const circles = points.map((p) => new google.maps.Circle({
      map,
      center: { lat: p.lat, lng: p.lng },
      radius: 2300,
      fillColor: colorFor(hazard, p.weight),
      fillOpacity: 0.16 + p.weight * 0.34,
      strokeWeight: 0,
      clickable: false,
      zIndex: 1,
    }));
    return () => circles.forEach((c) => { try { c.setMap(null); } catch { /* noop */ } });
  }, [map, hazard, points]);

  // air -> real Google Air Quality heatmap tiles
  useEffect(() => {
    if (!map || hazard !== "air") return;
    const ov = new google.maps.ImageMapType({
      name: "aq",
      tileSize: new google.maps.Size(256, 256),
      maxZoom: 16,
      opacity: 0.7,
      getTileUrl: (c, z) => `https://airquality.googleapis.com/v1/mapTypes/${AQ_TYPE}/heatmapTiles/${z}/${c.x}/${c.y}?key=${apiKey}`,
    });
    map.overlayMapTypes.push(ov);
    return () => { const i = map.overlayMapTypes.getArray().indexOf(ov); if (i >= 0) map.overlayMapTypes.removeAt(i); };
  }, [map, hazard, apiKey]);

  // selected marker
  useEffect(() => {
    if (!map || !selected) return;
    const m = new google.maps.Marker({ map, position: selected, animation: google.maps.Animation.DROP });
    return () => m.setMap(null);
  }, [map, selected]);

  return null;
}

interface Props {
  apiKey: string;
  hazard: string;
  selected: { lat: number; lng: number } | null;
  onSelect: (lat: number, lng: number) => void;
}

export default function MapView({ apiKey, hazard, selected, onSelect }: Props) {
  const [satellite, setSatellite] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Blank-on-load fix: vis.gl observes the container with a ResizeObserver, so a
  // real container size change (not a synthetic window event) is needed to make
  // the map paint. Nudge the height by 1px a few times until the map is ready.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const nudge = () => {
      el.style.bottom = "1px";
      requestAnimationFrame(() => { el.style.bottom = "0px"; });
    };
    const timers = [600, 1500, 3000].map((d) => window.setTimeout(nudge, d));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="mapview" ref={wrapRef}>
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={CHENNAI}
          defaultZoom={12}
          mapTypeId={satellite ? "hybrid" : "roadmap"}
          gestureHandling="greedy"
          disableDefaultUI
          clickableIcons={false}
          onClick={(ev) => { const ll = ev.detail.latLng; if (ll) onSelect(ll.lat, ll.lng); }}
          style={{ width: "100%", height: "100%" }}
        >
          <Overlay apiKey={apiKey} hazard={hazard} selected={selected} />
        </Map>
      </APIProvider>
      <div className="map-toggles">
        <button className={!satellite ? "on" : ""} onClick={() => setSatellite(false)}>Map</button>
        <button className={satellite ? "on" : ""} onClick={() => setSatellite(true)}>Satellite</button>
      </div>
    </div>
  );
}
