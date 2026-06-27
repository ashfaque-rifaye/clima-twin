/// <reference types="google.maps" />
import { useEffect, useState } from "react";
import { APIProvider, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { getGrid } from "./api";

const CHENNAI = { lat: 13.06, lng: 80.24 };
const AQ_TYPE = "UAQI_RED_GREEN";

const GRAD: Record<string, string[]> = {
  heat: ["rgba(0,200,160,0)", "#1fd1a3", "#f6c453", "#ff8a3c", "#ff3b30", "#7a0010"],
  flood: ["rgba(91,208,255,0)", "#9fe8ff", "#3aa0ff", "#2b6fff", "#1a3fd0", "#06104f"],
};

const DARK: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0a121a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a121a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#62748a" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#16222e" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#1e3040" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#05203a" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#26333f" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#0c1620" }] },
];

function HeatOverlay({ apiKey, hazard, selected }: { apiKey: string; hazard: string; selected: { lat: number; lng: number } | null }) {
  const map = useMap();
  const vis = useMapsLibrary("visualization");
  const [points, setPoints] = useState<{ lat: number; lng: number; weight: number }[]>([]);

  useEffect(() => {
    if (hazard === "air") { setPoints([]); return; }
    let alive = true;
    getGrid(hazard).then((r) => { if (alive) setPoints(r.points); }).catch(() => setPoints([]));
    return () => { alive = false; };
  }, [hazard]);

  // heat / flood -> continuous HeatmapLayer from the live grid
  useEffect(() => {
    if (!map || !vis || hazard === "air" || !points.length) return;
    let hm: { setMap(m: google.maps.Map | null): void } | undefined;
    try {
      const data = points.map((p) => ({ location: new google.maps.LatLng(p.lat, p.lng), weight: p.weight }));
      hm = new (vis as unknown as { HeatmapLayer: new (o: unknown) => { setMap(m: google.maps.Map | null): void } }).HeatmapLayer({
        data, map, radius: 64, opacity: 0.72, dissipating: true, maxIntensity: 1, gradient: GRAD[hazard],
      });
    } catch (e) { console.warn("heatmap error", e); }
    return () => { try { hm?.setMap(null); } catch { /* noop */ } };
  }, [map, vis, hazard, points]);

  // air -> real Google Air Quality heatmap tiles
  useEffect(() => {
    if (!map || hazard !== "air") return;
    const overlay = new google.maps.ImageMapType({
      name: "aq",
      tileSize: new google.maps.Size(256, 256),
      maxZoom: 16,
      opacity: 0.7,
      getTileUrl: (c, z) => `https://airquality.googleapis.com/v1/mapTypes/${AQ_TYPE}/heatmapTiles/${z}/${c.x}/${c.y}?key=${apiKey}`,
    });
    map.overlayMapTypes.push(overlay);
    return () => {
      const i = map.overlayMapTypes.getArray().indexOf(overlay);
      if (i >= 0) map.overlayMapTypes.removeAt(i);
    };
  }, [map, hazard, apiKey]);

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
          <HeatOverlay apiKey={apiKey} hazard={hazard} selected={selected} />
        </Map>
      </APIProvider>
      <div className="map-toggles">
        <button className={!satellite ? "on" : ""} onClick={() => setSatellite(false)}>Map</button>
        <button className={satellite ? "on" : ""} onClick={() => setSatellite(true)}>Satellite</button>
      </div>
    </div>
  );
}
