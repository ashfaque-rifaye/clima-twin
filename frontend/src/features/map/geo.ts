// Real Chennai geography, digitized (simplified) from public map data.
// Every feature here corresponds to an actual place or channel — this module
// is the ONLY source of vector geometry drawn on the map.

export type LngLat = [number, number];

/** Coastline (Bay of Bengal), north → south: [lat, lng of shoreline]. */
export const COASTLINE: [number, number][] = [
  [13.24, 80.32], [13.18, 80.308], [13.13, 80.3], [13.1, 80.297],
  [13.06, 80.286], [13.03, 80.28], [13.0, 80.272], [12.97, 80.264],
  [12.93, 80.257], [12.89, 80.251], [12.84, 80.246],
];

/** Longitude of the shoreline at a latitude (linear interpolation). */
export function coastLngAt(lat: number): number {
  const c = COASTLINE;
  if (lat >= c[0][0]) return c[0][1];
  if (lat <= c[c.length - 1][0]) return c[c.length - 1][1];
  for (let i = 1; i < c.length; i++) {
    if (lat >= c[i][0]) {
      const t = (lat - c[i][0]) / (c[i - 1][0] - c[i][0]);
      return c[i][1] + t * (c[i - 1][1] - c[i][1]);
    }
  }
  return c[c.length - 1][1];
}

/** Real waterways, digitized upstream → mouth (arrows point downstream). */
export const WATERWAYS: { name: string; path: LngLat[] }[] = [
  {
    name: "Cooum River",
    path: [
      [80.152, 13.087], [80.168, 13.081], [80.183, 13.077], [80.198, 13.073],
      [80.212, 13.071], [80.225, 13.07], [80.238, 13.072], [80.25, 13.071],
      [80.261, 13.068], [80.272, 13.066], [80.281, 13.064], [80.287, 13.063],
    ],
  },
  {
    name: "Adyar River",
    path: [
      [80.158, 12.997], [80.172, 13.004], [80.186, 13.011], [80.2, 13.015],
      [80.213, 13.014], [80.226, 13.011], [80.238, 13.008], [80.25, 13.009],
      [80.259, 13.011], [80.268, 13.012], [80.275, 13.011],
    ],
  },
  {
    name: "Buckingham Canal",
    path: [
      [80.313, 13.198], [80.301, 13.155], [80.294, 13.118], [80.291, 13.093],
      [80.287, 13.066], [80.283, 13.043], [80.272, 13.021], [80.261, 13.0],
      [80.255, 12.975], [80.249, 12.945], [80.244, 12.905], [80.241, 12.862],
    ],
  },
];

/** Real green infrastructure: parks, forests, wetlands (simplified polygons). */
export const GREEN_AREAS: { name: string; polygon: LngLat[] }[] = [
  {
    name: "Guindy National Park",
    polygon: [[80.228, 13.012], [80.243, 13.012], [80.246, 13.004], [80.241, 12.997], [80.23, 12.998], [80.226, 13.005]],
  },
  {
    name: "Pallikaranai Marsh",
    polygon: [[80.199, 12.957], [80.221, 12.955], [80.228, 12.937], [80.219, 12.917], [80.202, 12.916], [80.195, 12.938]],
  },
  {
    name: "Adyar Estuary · Theosophical Society",
    polygon: [[80.261, 13.017], [80.275, 13.015], [80.277, 13.005], [80.266, 13.002], [80.259, 13.008]],
  },
  {
    name: "Nanmangalam Reserve Forest",
    polygon: [[80.164, 12.947], [80.181, 12.946], [80.184, 12.928], [80.172, 12.921], [80.161, 12.929]],
  },
  {
    name: "Semmozhi Poonga",
    polygon: [[80.2475, 13.0605], [80.2545, 13.0605], [80.2545, 13.0545], [80.2475, 13.0545]],
  },
];

/** Ecological corridor links along real features (rivers, coast, marsh belt).
 *  status: connectivity assessment — healthy | fragmented | missing. */
export type CorridorStatus = "healthy" | "fragmented" | "missing";
export const GREEN_CORRIDORS: { name: string; status: CorridorStatus; path: LngLat[] }[] = [
  { name: "Adyar river corridor", status: "fragmented", path: [[80.2, 13.015], [80.226, 13.011], [80.25, 13.009], [80.268, 13.012]] },
  { name: "Coastal green edge", status: "healthy", path: [[80.272, 13.0], [80.264, 12.97], [80.257, 12.93], [80.251, 12.89]] },
  { name: "Marsh–forest link", status: "missing", path: [[80.2, 12.936], [80.19, 12.933], [80.181, 12.934]] },
];

/** Points where corridor continuity is broken (flagged for intervention). */
export const FRAGMENTATION_POINTS: { lat: number; lng: number }[] = [
  { lat: 13.013, lng: 80.21 },   // Adyar bank gap west of Guindy
  { lat: 12.955, lng: 80.24 },   // Velachery belt between marsh and coast
  { lat: 13.02, lng: 80.255 },   // urban gap north of the estuary
];

/**
 * Afternoon sea breeze (Chennai's prevailing onshore wind): from the ESE,
 * pushing inland toward the WNW. Unit-ish direction in degree-space.
 */
export const SEA_BREEZE = { dLng: -0.92, dLat: 0.18 };
