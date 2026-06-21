import { useCallback, useEffect, useState } from "react";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { getHotspots, getMicroclimate } from "./api";
import type { Hotspot, Microclimate } from "./api";
import "./App.css";

const CHENNAI = { lat: 13.0827, lng: 80.2707 };

const HAZARDS = [
  { id: "heat", label: "Heat", icon: "🔥" },
  { id: "flood", label: "Flood", icon: "🌊" },
  { id: "air", label: "Air", icon: "🌫️" },
] as const;

function aqiBand(aqi?: number) {
  if (aqi == null) return "";
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 150) return "poor";
  if (aqi <= 200) return "unhealthy";
  return "severe";
}

export default function App() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;

  const [hazard, setHazard] = useState<string>("heat");
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [readout, setReadout] = useState<Microclimate | null>(null);
  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    getHotspots(hazard, 6)
      .then((r) => { setHotspots(r.hotspots); setApiError(false); })
      .catch(() => { setHotspots([]); setApiError(true); });
  }, [hazard]);

  const inspect = useCallback(async (lat: number, lng: number) => {
    setSelected({ lat, lng });
    setLoading(true);
    try {
      setReadout(await getMicroclimate(lat, lng));
      setApiError(false);
    } catch {
      setReadout(null);
      setApiError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🌿 ClimaTwin <span>· Chennai</span></div>
        <div className="tag">Urban Microclimate Decision Engine</div>
      </header>

      <div className="body">
        <aside className="sidebar">
          <h2>Hazard</h2>
          <div className="hazards">
            {HAZARDS.map((h) => (
              <button
                key={h.id}
                className={hazard === h.id ? "haz active" : "haz"}
                onClick={() => setHazard(h.id)}
              >
                <span>{h.icon}</span>{h.label}
              </button>
            ))}
          </div>

          <h2>Priority hotspots</h2>
          {apiError && <p className="warn">Backend not reachable — start it on :8000.</p>}
          <div className="hotspot-list">
            {hotspots.map((h, i) => (
              <button key={h.id} className="hotspot-card" onClick={() => inspect(h.lat, h.lng)}>
                <div className="rank">{i + 1}</div>
                <div className="hc-body">
                  <div className="hc-name">{h.name}</div>
                  <div className="hc-why">{h.why}</div>
                </div>
                <div className="score">{h.priority_score.toFixed(2)}</div>
              </button>
            ))}
          </div>
          <p className="hint">Click a hotspot or the map to inspect a location. Simulation &amp; AI recommendations arrive on Days 3–5.</p>
        </aside>

        <main className="mapwrap">
          {apiKey ? (
            <APIProvider apiKey={apiKey}>
              <Map
                defaultCenter={CHENNAI}
                defaultZoom={12}
                mapId={mapId}
                gestureHandling="greedy"
                disableDefaultUI={false}
                onClick={(ev) => {
                  const ll = ev.detail.latLng;
                  if (ll) inspect(ll.lat, ll.lng);
                }}
                style={{ width: "100%", height: "100%" }}
              >
                {hotspots.map((h) => (
                  <Marker key={h.id} position={{ lat: h.lat, lng: h.lng }} onClick={() => inspect(h.lat, h.lng)} />
                ))}
                {selected && <Marker position={selected} />}
              </Map>
            </APIProvider>
          ) : (
            <div className="setup">
              <h3>Map needs a key 🔑</h3>
              <p>Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to <code>frontend/.env</code> and restart.</p>
              <p>Meanwhile, the platform is fully usable — <b>click a hotspot</b> on the left to inspect it.</p>
            </div>
          )}

          {(readout || loading) && (
            <div className="readout">
              {loading && !readout ? (
                <div className="ro-loading">Reading microclimate…</div>
              ) : readout ? (
                <>
                  <div className="ro-head">
                    <span className="ro-name">{readout.area_name ?? "Selected point"}</span>
                    <span className="ro-src">{readout.source} data</span>
                  </div>
                  <div className="ro-feels">
                    <span className="big">{readout.feels_like_c?.toFixed(0)}°C</span>
                    <span className="ro-sub">feels-like · surface {readout.surface_temp_c?.toFixed(0)}°C</span>
                  </div>
                  <div className="ro-grid">
                    <div className={`pill aqi-${aqiBand(readout.air_quality_index)}`}>
                      AQI {readout.air_quality_index} <small>{readout.dominant_pollutant}</small>
                    </div>
                    <div className="pill">🌳 {readout.green_cover_pct}% canopy</div>
                    <div className="pill">🌊 flood: {readout.flood_risk}</div>
                    <div className="pill">🚌 {readout.bus_commuters_daily?.toLocaleString()} commuters/day</div>
                    <div className="pill">👵 {readout.elderly_pct}% elderly</div>
                    <div className="pill">📡 data: {readout.data_density}</div>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
