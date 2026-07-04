import { useEffect } from "react";
import { useClimaStore } from "../../../store/useClimaStore";
import { hourLabel } from "../../../lib/format";

export default function ScenarioTimeline() {
  const hour = useClimaStore((s) => s.hour);
  const playing = useClimaStore((s) => s.playing);
  const setHour = useClimaStore((s) => s.setHour);
  const togglePlay = useClimaStore((s) => s.togglePlay);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setHour(useClimaStore.getState().hour + 1), 900);
    return () => window.clearInterval(id);
  }, [playing, setHour]);

  return (
    <div className="timeline">
      <button className="tl-play" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "\u2759\u2759" : "\u25B6"}
      </button>
      <div className="tl-meta">
        <div className="mono-label">Scenario · diurnal</div>
        <div className="tl-hour mono">{hourLabel(hour)}</div>
      </div>
      <input
        className="tl-range"
        type="range"
        min={0}
        max={23}
        step={1}
        value={hour}
        onChange={(e) => setHour(+e.target.value)}
      />
    </div>
  );
}
