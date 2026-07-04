/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState } from "react";
import type { Layer } from "@deck.gl/core";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import {
  APIProvider,
  ColorScheme,
  Map,
  RenderingType,
  useMap,
  type MapMouseEvent,
} from "@vis.gl/react-google-maps";
import { getGrid, type GridPoint } from "../../services/api";
import { useClimaStore } from "../../store/useClimaStore";
import { HAZARD_META } from "../hazards/hazardMeta";
import { buildLayers } from "./layers";
import { densify } from "./densify";
import SelectedZoneCard from "./overlays/SelectedZoneCard";
import Legend from "./overlays/Legend";
import BasemapToggle from "./overlays/BasemapToggle";
import ZoomControls from "./overlays/ZoomControls";
import ScenarioTimeline from "./overlays/ScenarioTimeline";

const CHENNAI = { lat: 13.055, lng: 80.244 };
// Vector rendering (required by the interleaved deck.gl overlay) needs a Map ID.
// DEMO_MAP_ID is Google's documented id for development; override with a real
// styled Map ID via VITE_GOOGLE_MAPS_MAP_ID for production.
const MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || "DEMO_MAP_ID";

function DeckOverlay({ layers }: { layers: Layer[] }) {
  const map = useMap();
  const ref = useRef<GoogleMapsOverlay | null>(null);
  useEffect(() => {
    if (!map) return;
    // interleaved:false — HeatmapLayer's aggregation pass (weightsTexture) does
    // not survive deck.gl 9's interleaved GoogleMapsOverlay; the overlaid canvas
    // renders every layer type reliably.
    const overlay = new GoogleMapsOverlay({ interleaved: false });
    overlay.setMap(map);
    ref.current = overlay;
    return () => { overlay.setMap(null); overlay.finalize(); ref.current = null; };
  }, [map]);
  useEffect(() => { ref.current?.setProps({ layers }); }, [layers]);
  return null;
}

// Ensures the vector map paints on first mount and on tab refocus.
function MapReady() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const el = map.getDiv() as HTMLElement | null;
    const fire = () => {
      if (el) el.style.minHeight = el.style.minHeight === "100.001%" ? "100%" : "100.001%";
      google.maps.event.trigger(map, "resize");
    };
    const timers = [50, 200, 600, 1400, 2600].map((ms) => window.setTimeout(fire, ms));
    const ro = new ResizeObserver(() => google.maps.event.trigger(map, "resize"));
    if (el) ro.observe(el);
    const onVisible = () => { if (!document.hidden) fire(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { timers.forEach(clearTimeout); ro.disconnect(); document.removeEventListener("visibilitychange", onVisible); };
  }, [map]);
  return null;
}

function Camera() {
  const map = useMap();
  const selected = useClimaStore((s) => s.selected);
  useEffect(() => {
    if (!map || !selected) return;
    map.panTo(selected);
    if ((map.getZoom() ?? 11) < 12) map.setZoom(12);
  }, [map, selected]);
  return null;
}

export default function MapStage() {
  const hazard = useClimaStore((s) => s.hazard);
  const basemap = useClimaStore((s) => s.basemap);
  const hotspots = useClimaStore((s) => s.hotspots);
  const selected = useClimaStore((s) => s.selected);
  const mapsKey = useClimaStore((s) => s.mapsKey);
  const select = useClimaStore((s) => s.select);
  const sim = useClimaStore((s) => s.sim);

  const [grid, setGrid] = useState<GridPoint[]>([]);
  const [time, setTime] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getGrid(hazard)
      .then((r) => { if (!cancelled) setGrid(r.points); })
      .catch(() => { if (!cancelled) setGrid(hotspots.map((n) => ({ lat: n.lat, lng: n.lng, weight: n.priority_score, name: n.name }))); });
    return () => { cancelled = true; };
  }, [hazard, hotspots]);

  // subtle animation — air particle flux and/or the cooling ripple after a sim
  useEffect(() => {
    const animate = hazard === "air" || !!sim;
    if (!animate) { setTime(0); return; }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (now - last > 55) { setTime((t) => (t + 0.012) % 1); last = now; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hazard, sim]);

  const cells = useMemo(() => densify(grid), [grid]);

  const layers = useMemo(
    () => buildLayers({ hazard, grid, cells, hotspots, selected, time, ripple: !!sim }),
    [hazard, grid, cells, hotspots, selected, time, sim],
  );

  const onClick = (e: MapMouseEvent) => {
    const ll = e.detail.latLng;
    if (ll) select(ll.lat, ll.lng);
  };

  if (!mapsKey) {
    return (
      <div className={`map-stage hz-${hazard} map-nokey`}>
        <div className="map-nokey-card">
          <b>Google Maps key required</b>
          <span>Set VITE_GOOGLE_MAPS_API_KEY or expose it from the backend /config.</span>
        </div>
        <Legend />
      </div>
    );
  }

  return (
    <div className={`map-stage hz-${hazard}`}>
      <APIProvider apiKey={mapsKey}>
        <Map
          className="map-canvas"
          mapId={MAP_ID}
          defaultCenter={CHENNAI}
          defaultZoom={11}
          defaultTilt={hazard === "heat" ? 47 : 0}
          defaultHeading={-14}
          colorScheme={ColorScheme.DARK}
          renderingType={RenderingType.VECTOR}
          mapTypeId={basemap === "satellite" ? "hybrid" : "roadmap"}
          gestureHandling="greedy"
          disableDefaultUI
          onClick={onClick}
        >
          <DeckOverlay layers={layers} />
          <MapReady />
          <Camera />
        </Map>
        <ZoomControls />
      </APIProvider>

      <div className="map-vignette" aria-hidden />
      <SelectedZoneCard />
      <Legend />
      <div className="map-hint">{HAZARD_META[hazard].layerSubtitle}</div>
      <BasemapToggle />
      <ScenarioTimeline />
    </div>
  );
}
