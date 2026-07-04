import { useMap } from "@vis.gl/react-google-maps";

export default function ZoomControls() {
  const map = useMap();
  const step = (d: number) => {
    if (!map) return;
    map.setZoom((map.getZoom() ?? 11) + d);
  };
  return (
    <div className="zoom-controls">
      <button aria-label="Zoom in" onClick={() => step(1)}>+</button>
      <span className="zoom-div" />
      <button aria-label="Zoom out" onClick={() => step(-1)}>&#8722;</button>
    </div>
  );
}
