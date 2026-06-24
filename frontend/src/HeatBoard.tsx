import type { Hotspot } from "./api";

const W = 800;
const H = 600;
const PAD = 96;

const HAZARD_RAMP: Record<string, string[]> = {
  heat: ["#19c39a", "#f6c453", "#ef6f3c", "#e23b3b"],
  flood: ["#7fe0ff", "#5bd0ff", "#2b8bff", "#1a5fd0"],
  air: ["#9be8c0", "#cdb4ff", "#8c5cff", "#6a2fe0"],
};

function rampColor(hazard: string, score: number) {
  const ramp = HAZARD_RAMP[hazard] ?? HAZARD_RAMP.heat;
  const i = score >= 0.7 ? 3 : score >= 0.55 ? 2 : score >= 0.4 ? 1 : 0;
  return ramp[i];
}

interface Props {
  hazard: string;
  nodes: Hotspot[];
  selected: { lat: number; lng: number } | null;
  onSelect: (lat: number, lng: number) => void;
}

export default function HeatBoard({ hazard, nodes, selected, onSelect }: Props) {
  if (!nodes.length) {
    return <div className="board-empty">Loading Chennai zones…</div>;
  }

  const lats = nodes.map((n) => n.lat);
  const lngs = nodes.map((n) => n.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const x = (lng: number) => PAD + ((lng - minLng) / (maxLng - minLng || 1)) * (W - 2 * PAD);
  const y = (lat: number) => PAD + ((maxLat - lat) / (maxLat - minLat || 1)) * (H - 2 * PAD);

  const top = nodes.reduce((a, b) => (b.priority_score > a.priority_score ? b : a), nodes[0]);

  return (
    <svg className="board" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="vignette" cx="50%" cy="40%" r="75%">
          <stop offset="0%" stopColor="#0e1822" />
          <stop offset="100%" stopColor="#070b10" />
        </radialGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(43,139,255,0)" />
          <stop offset="100%" stopColor="rgba(43,139,255,0.16)" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width={W} height={H} fill="url(#vignette)" />
      {/* faint grid */}
      {Array.from({ length: 9 }).map((_, i) => (
        <line key={`v${i}`} x1={(W / 8) * i} y1="0" x2={(W / 8) * i} y2={H} stroke="rgba(255,255,255,.035)" />
      ))}
      {Array.from({ length: 7 }).map((_, i) => (
        <line key={`h${i}`} x1="0" y1={(H / 6) * i} x2={W} y2={(H / 6) * i} stroke="rgba(255,255,255,.035)" />
      ))}

      {/* Bay of Bengal hint (east coast on the right) */}
      <rect x={W - 150} y="0" width="150" height={H} fill="url(#sea)" />
      <path d={`M ${W - 120} 0 C ${W - 150} 160, ${W - 100} 300, ${W - 135} ${H}`} fill="none" stroke="rgba(91,208,255,.35)" strokeWidth="2" />
      <text x={W - 70} y={H - 26} fill="rgba(91,208,255,.5)" fontSize="13" textAnchor="middle">Bay of Bengal</text>

      {/* connectors from top hotspot */}
      {nodes.filter((n) => n.id !== top.id).map((n) => (
        <line key={`c${n.id}`} x1={x(top.lng)} y1={y(top.lat)} x2={x(n.lng)} y2={y(n.lat)} stroke="rgba(255,255,255,.05)" />
      ))}

      {nodes.map((n) => {
        const cx = x(n.lng), cy = y(n.lat);
        const r = 9 + n.priority_score * 17;
        const col = rampColor(hazard, n.priority_score);
        const isSel = !!selected && Math.abs(selected.lat - n.lat) < 1e-6 && Math.abs(selected.lng - n.lng) < 1e-6;
        return (
          <g key={n.id} className="node" onClick={() => onSelect(n.lat, n.lng)} style={{ cursor: "pointer" }}>
            <circle cx={cx} cy={cy} r={r * 2.1} fill={col} opacity="0.14" />
            {n.id === top.id && <circle className="pulse" cx={cx} cy={cy} r={r} fill={col} opacity="0.16" />}
            <circle cx={cx} cy={cy} r={r} fill={col} opacity="0.96" />
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,.85)" strokeWidth={isSel ? 3 : 1} />
            {isSel && <circle cx={cx} cy={cy} r={r + 8} fill="none" stroke="#fff" strokeWidth="1.5" opacity=".8" />}
            <text x={cx} y={cy - r - 9} fill="#dfe9f0" fontSize="13" fontWeight="600" textAnchor="middle">{n.name}</text>
            <text x={cx} y={cy + 4} fill="#08121a" fontSize="11" fontWeight="800" textAnchor="middle">{n.priority_score.toFixed(2)}</text>
          </g>
        );
      })}
    </svg>
  );
}
