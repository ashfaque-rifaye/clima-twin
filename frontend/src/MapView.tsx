/// <reference types="google.maps" />
import { useEffect, useState } from "react";
import { APIProvider, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import type { Hotspot } from "./api";

const CHENNAI = { lat: 13.05, lng: 80.23 };

const GRADIENTS: Record<string, string[]> = {
  heat: ["rgba(25,195,154,0)", "#19c39a", "#f6c453", "#ef6f3c", "#e23b3b"],
  flood: ["rgba(91,208,255,0)", "#7fe0ff", "#5bd0ff", "#2b8bff", "#1a5fd0"],
  air: ["rgba(155,232,192,0)", "#9be8c0", "#cdb4ff", "#8c5cff", "#6a2fe0"],
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
  const vis = useMapsLibrary("visualization");
  // Loosely typed: @types/google.maps visualization defs vary by version; runtime is correct.
  const [heatmap, setHeatmap] = useState<any>(null);

  useEffect(() => {
    if (!map || !vis) return;
    const hm = new (vis as any).HeatmapLayer({ map, radius: 72, opacity: 0.65 });
    setHeatmap(hm);
    return () => hm.setMap(null);
  }, [map, vis]);

  useEffect(() => {
    if (!heatmap) return;
    heatmap.setData(nodes.map((n) => ({ location: new google.maps.LatLng(n.lat, n.lng), weight: Math.pow(n.priority_score, 1.5) })));
    heatmap.set("gradient", GRADIENTS[hazard] ?? GRADIENTS.heat);
  }, [heatmap, hazard, nodes]);

  useEffect(() => {
    if (!map) return;
    const markers = nodes.map((n) => {
      const m = new google.maps.Marker({ position: { lat: n.lat, lng: n.lng }, map, title: `${n.name} · ${n.priority_score.toFixed(2)}` });
      m.addListener("click", () => onSelect(n.lat, n.lng));
      return m;
    });
    return () => markers.forEach((m) => m.setMap(null));
  }, [map, nodes, onSelect]);

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
