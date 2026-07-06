import { Suspense, lazy, useEffect } from "react";
import "./App.css";
import ErrorBoundary from "./ErrorBoundary";
import Header from "./features/layout/Header";
import Sidebar from "./features/sidebar/Sidebar";
import { useClimaStore } from "./store/useClimaStore";

// Code-split the heavy map bundle (deck.gl + Google Maps) out of first paint.
const MapStage = lazy(() => import("./features/map/MapStage"));

const DEFAULT_POINT = { lat: 13.0827, lng: 80.2707 }; // Chennai Marina reference

export default function App() {
  const loadConfig = useClimaStore((s) => s.loadConfig);
  const loadHotspots = useClimaStore((s) => s.loadHotspots);
  const loadCatalogue = useClimaStore((s) => s.loadCatalogue);
  const select = useClimaStore((s) => s.select);

  useEffect(() => {
    void loadConfig();
    void loadHotspots();
    void loadCatalogue();
    void select(DEFAULT_POINT.lat, DEFAULT_POINT.lng);
  }, [loadConfig, loadHotspots, loadCatalogue, select]);

  return (
    <div className="app">
      <Header />
      <div className="app-body">
        <ErrorBoundary
          fallback={
            <div className="map-stage map-nokey">
              <div className="map-nokey-card"><b>Map failed to load</b><span>Reload the page, or check the Google Maps key.</span></div>
            </div>
          }
        >
          <Suspense fallback={<div className="map-stage map-nokey"><div className="map-nokey-card"><b>Loading map…</b><span>Initialising the Chennai digital twin.</span></div></div>}>
            <MapStage />
          </Suspense>
        </ErrorBoundary>
        <Sidebar />
      </div>
    </div>
  );
}
