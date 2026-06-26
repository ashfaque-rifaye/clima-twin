/// <reference types="google.maps" />
import { useEffect, useState } from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import type { Hotspot } from "./api";

const CHENNAI = { lat: 13.05, lng: 80.23 };

const RAMP: Record<string, string[]> = {
  heat: ["#19c39a", "#f6c453", "#ef6f3c", "#e23b3b"],
  flood: ["#7fe0ff", "#5bd0ff", "#2b8bff", "#1a5fd0"],
  air: ["#9be8c0", "#cdb4ff", "#8c5cff", "#6a2fe0"],
};
const ramp = (h: string, s: number) => {
  const r = RAMP[h] ?? RAMP.heat;
  return r[s >= 0.7 ? 3 : s >= 0.55 ? 2 : s >= 0.4 ? 1 : 0];
};

const DARK: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0e1620" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0e1620" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8aa0b2" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a2233" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1b2733" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#2a3744" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#10191f" }] },
];

function Overlays({ hazard, nodes, onSelect }: { hazard: string; nodes: Hotspot[]; onSelect: (lat: number, lng: number) => void }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const overlays: Array<google.maps.Circle | google.maps.Marker> = [];
    try {
      nodes.forEach((n) => {
        const col = ramp(hazard, n.priority_score);
        const halo = new google.maps.Circle({ map, center: { lat: n.lat, lng: n.lng }, radius: 1000 + n.priority_score * 1700, fillColor: col, fillOpacity: 0.16, strokeWeight: 0, clickable: false });
        const core = new google.maps.Circle({ map, center: { lat: n.lat, lng: n.lng }, radius: 380 + n.priority_score * 520, fillColor: col, fillOpacity: 0.5, strokeColor: "#ffffff", strokeOpacity: 0.5, strokeWeight: 1 });
        core.addListener("click", () => onSelect(n.lat, n.lng));
        const marker = new google.maps.Marker({
          position: { lat: n.lat, lng: n.lng }, map, title: `${n.name} · ${n.priority_score.toFixed(2)}`,
          label: { text: n.name, color: "#e8eef3", fontSize: "11px", fontWeight: "600" },
        });
        marker.addListener("click", () => onSelect(n.lat, n.lng));
        overlays.push(halo, core, marker);
      });
    } catch (e) {
      console.warn("overlay error", e);
    }
    return () => overlays.forEach((o) => { try { o.setMap(null); } catch { /* noop */ } });
  }, [map, nodes, hazard, onSelect]);

  return null;
}

interface Props {
  apiKey: string;
  hazard: string;
  nodes: Hotspot[];
  selected: { lat: number; lng: number } | null;
  onSelect: (lat: number, lng: number) => void;
}

export default function MapView({ apiKey, hazard, nodes, onSelect }: Props) {
  const [satellite, setSatellite] = useState(false);
  return (
    <div className="mapview">
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={CHENNAI}
          defaultZoom={12}
          mapTypeId={satellite ? "hybrid" : "roadmap"}
          styles={satellite ? undefined : DARK}
          gestureHandling="greedy"
          disableDefaultUI
          clickableIcons={false}
          onClick={(ev) => { const ll = ev.detail.latLng; if (ll) onSelect(ll.lat, ll.lng); }}
          style={{ width: "100%", height: "100%" }}
        >
          <Overlays hazard={hazard} nodes={nodes} onSelect={onSelect} />
        </Map>
      </APIProvider>
      <div className="map-toggles">
        <button className={!satellite ? "on" : ""} onClick={() => setSatellite(false)}>Map</button>
        <button className={satellite ? "on" : ""} onClick={() => setSatellite(true)}>Satellite</button>
      </div>
    </div>
  );
}
