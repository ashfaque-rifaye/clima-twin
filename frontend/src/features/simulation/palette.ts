import type { HazardId } from "../hazards/hazardMeta";

// Intervention catalogue for the Budget Simulator. `step` is the +/- increment.
export interface PaletteItem {
  key: string;
  label: string;
  type: string;
  species: string;
  step: number;
  note: string;
  hazards: HazardId[];
}

export const PALETTE: PaletteItem[] = [
  { key: "pungai", label: "Pungai canopy", type: "tree", species: "pungai", step: 20, note: "native shade, low water", hazards: ["heat", "air"] },
  { key: "neem", label: "Neem buffer", type: "tree", species: "neem", step: 20, note: "PM screen, hardy street tree", hazards: ["air", "heat"] },
  { key: "portia", label: "Coastal Portia", type: "tree", species: "portia", step: 10, note: "salt-tolerant green edge", hazards: ["flood", "heat"] },
  { key: "cool_roof", label: "Cool roof blocks", type: "cool_roof", species: "cool_roof", step: 2, note: "cuts roof heat gain", hazards: ["heat"] },
  { key: "shade_sail", label: "Shade sails", type: "shade", species: "shade_sail", step: 1, note: "instant waiting-area relief", hazards: ["heat", "air"] },
  { key: "misting", label: "Cooling point", type: "misting", species: "misting", step: 1, note: "high relief, water-metered", hazards: ["heat"] },
  { key: "permeable", label: "Permeable paving", type: "permeable", species: "permeable", step: 50, note: "absorbs runoff at street edge", hazards: ["flood"] },
  { key: "rain_garden", label: "Rain garden", type: "rain_garden", species: "rain_garden", step: 2, note: "bioswale for monsoon runoff", hazards: ["flood", "heat"] },
];

export const mixToInterventions = (mix: Record<string, number>) =>
  PALETTE.filter((p) => (mix[p.key] || 0) > 0).map((p) => ({
    type: p.type,
    species: p.species,
    count: mix[p.key],
  }));
