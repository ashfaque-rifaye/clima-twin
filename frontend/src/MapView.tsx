/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { getGrid } from "./api";

const CHENNAI = { lat: 13.06, lng: 80.24 };
const AQ_TYPE = "UAQI_RED_GREEN";

type RGB = [number, number, number];
const COLORS: Record<string, RGB[]> = {
  heat: [[0, 180, 150], [120, 210, 90], [246, 196, 83], [255, 138, 60], [255, 59, 48], [150, 0, 20]],
  flood: [[150, 230, 255], [90, 200, 255], [58, 160, 255], [43, 111, 255], [26, 63, 208], [6, 16, 90]],
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

function Overlay({ apiKey, hazard, selected }: { apiKey: string; hazard: string; selected: { lat: number; lng: number } | null }) {
  const map = useMap();
  const [points, setPoints] = useState<{ lat: number; lng: number; weight: number }[]>([]);
  const deckRef = useRef<GoogleMapsOverlay | null>(null);

  // force the map to paint tiles on first load (blank-until-resize bug);
  // a window 'resize' makes Google Maps re-render. Fire on an interval for the
  // first few seconds so one lands once the map is ready; harmless afterwards.
  useEffect(() => {
    if (!map) return;
    const fire = () => window.dispatchEvent(new Event("resize"));
    fire();
    const iv = setInterval(fire, 500);
    const stop = setTimeout(() => clearInterval(iv), 10000);
    return () => { clearInterval(iv); clearTimeout(stop); };
  }, [map]);

  // fetch the live grid for heat/flood
  useEffect(() => {
    if (hazard === "air") { setPoints([]); return; }
    let alive = true;
    getGrid(hazard).then((r) => { if (alive) setPoints(r.points); }).catch(() => setPoints([]));
    return () => { alive = false; };
  }, [hazard]);

  // deck.gl GPU heatmap for heat/flood
  useEffect(() => {
    if (!map) return;
    if (!deckRef.current) { deckRef.current = new GoogleMapsOverlay({ interleaved: false }); deckRef.current.setMap(map); }
    const layers = hazard !== "air" && points.length
      ? [new HeatmapLayer<{ lat: number; lng: number; weight: number }>({
          id: `heat-${hazard}`,
          data: points,
          getPosition: (d) => [d.lng, d.lat],
          getWeight: (d) => d.weight,
          radiusPixels: 135,
          intensity: 1.2,
          threshold: 0.02,
          colorRange: COLORS[hazard] ?? COLORS.heat,
          opacity: 0.7,
        })]
      : [];
    deckRef.current.setProps({ layers });
  }, [map, hazard, points]);

  useEffect(() => () => { deckRef.current?.setMap(null); deckRef.current = null; }, []);

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
    return () => { const i = map.overlayMapTypes.getArray().indexOf(overlay); if (i >= 0) map.overlayMapTypes.removeAt(i); };
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
