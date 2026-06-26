/// <reference types="google.maps" />
import { useEffect, useState } from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import type { Hotspot } from "./api";

const CHENNAI = { lat: 13.06, lng: 80.24 };

const RAMP: Record<string, string[]> = {
  heat: ["#33c08a", "#f6c453", "#ef6f3c", "#e23b3b"],
  flood: ["#7fe0ff", "#5bd0ff", "#2b8bff", "#1a5fd0"],
  air: ["#7ed6a8", "#cdb4ff", "#8c5cff", "#6a2fe0"],
};
const ramp = (h: string, s: number) => {
  const r = RAMP[h] ?? RAMP.heat;
  return r[s >= 0.7 ? 3 : s >= 0.55 ? 2 : s >= 0.4 ? 1 : 0];
};

function Overlays({ hazard, nodes, selected }: { hazard: string; nodes: Hotspot[]; selected: { lat: number; lng: number } | null }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const circles: google.maps.Circle[] = [];
    try {
      nodes.forEach((n) => {
        const col = ramp(hazard, n.priority_score);
        circles.push(new google.maps.Circle({ map, center: { lat: n.lat, lng: n.lng }, radius: 1200 + n.priority_score * 1800, fillColor: col, fillOpacity: 0.2, strokeWeight: 0, clickable: false }));
        circles.push(new google.maps.Circle({ map, center: { lat: n.lat, lng: n.lng }, radius: 450 + n.priority_score * 600, fillColor: col, fillOpacity: 0.42, strokeColor: "#ffffff", strokeOpacity: 0.7, strokeWeight: 1, clickable: false }));
      });
    } catch (e) { console.warn("overlay error", e); }
    return () => circles.forEach((c) => { try { c.setMap(null); } catch { /* noop */ } });
  }, [map, nodes, hazard]);

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
  nodes: Hotspot[];
  selected: { lat: number; lng: number } | null;
  onSelect: (lat: number, lng: number) => void;
}

export default function MapView({ apiKey, hazard, nodes, selected, onSelect }: Props) {
  const [satellite, setSatellite] = useState(false);
  return (
    <div className="mapview">
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
          <Overlays hazard={hazard} nodes={nodes} selected={selected} />
        </Map>
      </APIProvider>
      <div className="map-toggles">
        <button className={!satellite ? "on" : ""} onClick={() => setSatellite(false)}>Map</button>
        <button className={satellite ? "on" : ""} onClick={() => setSatellite(true)}>Satellite</button>
      </div>
    </div>
  );
}
