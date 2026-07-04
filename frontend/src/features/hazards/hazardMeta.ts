// Per-hazard visual + copy identity. Single source consumed by the map layers,
// sidebar cards, header toggle and legend. Mirrors docs/DESIGN-SYSTEM.md §7.
export type HazardId = "heat" | "flood" | "air" | "green";

export interface HazardMeta {
  id: HazardId;
  label: string;
  color: string;                 // CSS accent (hex)
  rgb: [number, number, number]; // deck.gl base colour
  legend: { title: string; lo: string; hi: string; gradient: string };
  colorRange: [number, number, number, number][]; // deck HeatmapLayer ramp
  goal: string;                  // used for /recommend
  layerTitle: string;
  layerSubtitle: string;
  action: string;
  primaryLabel: string;
  simulateVerb: string;
}

export const HAZARDS: HazardId[] = ["heat", "flood", "air", "green"];

export const HAZARD_META: Record<HazardId, HazardMeta> = {
  heat: {
    id: "heat",
    label: "Heat",
    color: "#ea4335",
    rgb: [234, 67, 53],
    legend: {
      title: "Land surface temp",
      lo: "28\u00B0",
      hi: "46\u00B0",
      gradient: "linear-gradient(90deg,#13c39a,#f6c453,#ff8a3c,#ea4335)",
    },
    colorRange: [
      [19, 195, 154, 0],
      [31, 195, 154, 90],
      [246, 196, 83, 135],
      [255, 138, 60, 175],
      [255, 59, 48, 210],
      [122, 0, 16, 235],
    ],
    goal: "reduce heat stress for commuters, vendors and pedestrians",
    layerTitle: "Urban heat islands",
    layerSubtitle: "Land-surface temperature, canopy deficit and footfall",
    action: "Native canopy, shade sails, cool roofs and cooling points",
    primaryLabel: "Land surface temp",
    simulateVerb: "Simulate cooling",
  },
  flood: {
    id: "flood",
    label: "Flood",
    color: "#1a73e8",
    rgb: [26, 115, 232],
    legend: {
      title: "Flood exposure",
      lo: "Low",
      hi: "High",
      gradient: "linear-gradient(90deg,#9fe8ff,#48c7ff,#2b8bff,#0b3aa0)",
    },
    colorRange: [
      [100, 224, 255, 0],
      [159, 232, 255, 95],
      [72, 199, 255, 145],
      [43, 139, 255, 190],
      [20, 77, 190, 220],
      [5, 14, 75, 235],
    ],
    goal: "reduce flood and waterlogging risk in dense low-lying neighbourhoods",
    layerTitle: "Flood resilience",
    layerSubtitle: "Low ground, runoff paths, drainage and detention basins",
    action: "Permeable paving, bioswales, detention basins and canal relief",
    primaryLabel: "Flood risk",
    simulateVerb: "Simulate flood relief",
  },
  air: {
    id: "air",
    label: "Air",
    color: "#12b5cb",
    rgb: [18, 181, 203],
    legend: {
      title: "Air quality index",
      lo: "0",
      hi: "300+",
      gradient: "linear-gradient(90deg,#12b5cb,#7be0a0,#f6c453,#ff8a3c,#d93025)",
    },
    colorRange: [
      [18, 181, 203, 0],
      [123, 224, 160, 96],
      [246, 196, 83, 150],
      [255, 138, 60, 195],
      [217, 48, 37, 225],
      [123, 20, 20, 240],
    ],
    goal: "reduce AQI exposure for vulnerable pedestrians and schoolchildren",
    layerTitle: "Air-quality exposure",
    layerSubtitle: "AQI, traffic corridors and sensitive population",
    action: "Green buffers, low-idle zones, dust control and clean routes",
    primaryLabel: "Air quality index",
    simulateVerb: "Simulate exposure cut",
  },
  green: {
    id: "green",
    label: "Green",
    color: "#34d399",
    rgb: [52, 211, 153],
    legend: {
      title: "Corridor connectivity",
      lo: "Low",
      hi: "High",
      gradient: "linear-gradient(90deg,#0b3d2e,#128a5a,#34d399,#a7f3d0)",
    },
    colorRange: [
      [11, 61, 46, 0],
      [18, 138, 90, 110],
      [52, 211, 153, 175],
      [110, 231, 183, 210],
      [167, 243, 208, 235],
      [220, 255, 236, 245],
    ],
    goal: "strengthen green-infrastructure connectivity and canopy for cooling and biodiversity",
    layerTitle: "Green infrastructure",
    layerSubtitle: "Biodiversity corridors, canopy cover and fragmentation",
    action: "Corridor links, canopy infill, buffer strips and rewilding",
    primaryLabel: "Canopy cover",
    simulateVerb: "Simulate greening",
  },
};

export const asHazard = (v: string): HazardId =>
  v === "flood" || v === "air" || v === "green" ? v : "heat";
