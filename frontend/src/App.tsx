import { useState } from "react";
import { APIProvider, Map } from "@vis.gl/react-google-maps";
import "./App.css";

const CHENNAI = { lat: 13.0827, lng: 80.2707 };

const HAZARDS = [
  { id: "heat", label: "Heat", icon: "🔥" },
  { id: "flood", label: "Flood", icon: "🌊" },
  { id: "air", label: "Air", icon: "🌫️" },
] as const;

export default function App() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;
  const [hazard, setHazard] = useState<string>("heat");

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          🌿 ClimaTwin <span>· Chennai</span>
        </div>
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
                <span>{h.icon}</span>
                {h.label}
              </button>
            ))}
          </div>
          <p className="hint">
            Click the map to inspect a location. Live hazard layers, simulation,
            AI recommendations and proposals arrive on Days 2–5.
          </p>
        </aside>

        <main className="mapwrap">
          {apiKey ? (
            <APIProvider apiKey={apiKey}>
              <Map
                defaultCenter={CHENNAI}
                defaultZoom={12}
                mapId={mapId}
                gestureHandling="greedy"
                style={{ width: "100%", height: "100%" }}
              />
            </APIProvider>
          ) : (
            <div className="setup">
              <h3>Almost there 🔑</h3>
              <p>
                Add your Google Maps key to <code>frontend/.env</code>:
              </p>
              <pre>VITE_GOOGLE_MAPS_API_KEY=your_key_here</pre>
              <p>
                Then restart <code>npm run dev</code> — the Chennai map renders
                here.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
