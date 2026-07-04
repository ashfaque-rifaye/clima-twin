// Densifies the backend's coarse (real) grid into a fine lattice of points using
// inverse-distance weighting. The interpolated weights stay anchored to the real
// samples — we add visual resolution, not fake precision.
import type { GridPoint } from "../../services/api";

// Greater-Chennai bounding box (approx).
const BBOX = { south: 12.83, north: 13.24, west: 80.12, east: 80.32 };

export interface Cell { lat: number; lng: number; weight: number }

/**
 * @param grid  real weighted samples from /grid
 * @param n     lattice resolution per axis (n×n points)
 * @param power IDW exponent (higher = sharper local influence)
 */
export function densify(grid: GridPoint[], n = 46, power = 2.2): Cell[] {
  if (!grid.length) return [];
  const cells: Cell[] = [];
  const latStep = (BBOX.north - BBOX.south) / (n - 1);
  const lngStep = (BBOX.east - BBOX.west) / (n - 1);

  for (let i = 0; i < n; i++) {
    const lat = BBOX.south + i * latStep;
    for (let j = 0; j < n; j++) {
      const lng = BBOX.west + j * lngStep;
      let num = 0;
      let den = 0;
      let exact = -1;
      for (let k = 0; k < grid.length; k++) {
        const g = grid[k];
        const dLat = (lat - g.lat) * 111;
        const dLng = (lng - g.lng) * 108;
        const d2 = dLat * dLat + dLng * dLng;
        if (d2 < 1e-4) { exact = g.weight; break; }
        const w = 1 / Math.pow(d2, power / 2);
        num += w * g.weight;
        den += w;
      }
      const weight = exact >= 0 ? exact : den > 0 ? num / den : 0;
      // drop near-zero cells to keep the field crisp and the point count lean
      if (weight > 0.06) cells.push({ lat, lng, weight: +weight.toFixed(3) });
    }
  }
  return cells;
}
