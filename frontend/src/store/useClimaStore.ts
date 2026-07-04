import { create } from "zustand";
import {
  ask as apiAsk,
  getConfig,
  getHotspots,
  getPoint,
  proposal as apiProposal,
  recommend as apiRecommend,
  simulate as apiSimulate,
  type Hotspot,
  type PointData,
  type ProposalResp,
  type Recommendation,
  type SimResult,
} from "../services/api";
import { asHazard, HAZARD_META, type HazardId } from "../features/hazards/hazardMeta";
import { mixToInterventions, PALETTE } from "../features/simulation/palette";

export type Basemap = "map" | "satellite";
export type AppView = "planner" | "citizen";

/** A saved simulation snapshot for A/B scenario comparison. */
export interface Scenario {
  label: string;
  hazard: HazardId;
  delta: number;
  people: number;
  cost: number;
}

interface ClimaState {
  /* config */
  mapsKey: string | null;
  loadConfig: () => Promise<void>;

  /* view + hazard */
  view: AppView;
  setView: (v: AppView) => void;
  hazard: HazardId;
  setHazard: (h: HazardId) => void;
  basemap: Basemap;
  setBasemap: (b: Basemap) => void;

  /* hotspots */
  hotspots: Hotspot[];
  loadHotspots: () => Promise<void>;

  /* selection + live point */
  selected: { lat: number; lng: number } | null;
  point: PointData | null;
  pointBusy: boolean;
  select: (lat: number, lng: number) => Promise<void>;
  clearSelection: () => void;

  /* recommendation */
  reco: Recommendation | null;
  recoBusy: boolean;

  /* simulation */
  mix: Record<string, number>;
  budget: number;
  setBudget: (n: number) => void;
  bump: (key: string, delta: number) => void;
  loadRecoIntoMix: () => void;
  sim: SimResult | null;
  simBusy: boolean;
  runSim: () => Promise<void>;

  /* proposal */
  prop: ProposalResp | null;
  propBusy: boolean;
  runProposal: () => Promise<void>;
  closeProposal: () => void;

  /* ask */
  askAnswer: string | null;
  askBusy: boolean;
  runAsk: (q: string) => Promise<void>;
  clearAsk: () => void;

  /* scenario compare (A/B) */
  scenarios: { A: Scenario | null; B: Scenario | null };
  saveScenario: (slot: "A" | "B") => void;
  clearScenarios: () => void;

  /* scenario timeline */
  hour: number;
  playing: boolean;
  setHour: (h: number) => void;
  togglePlay: () => void;
}

export const useClimaStore = create<ClimaState>((set, get) => ({
  mapsKey: (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? null,
  async loadConfig() {
    try {
      const c = await getConfig();
      if (c.has_maps && c.maps_api_key) set({ mapsKey: c.maps_api_key });
    } catch {
      /* keep env key / fallback */
    }
  },

  view: "planner",
  setView: (view) => set({ view }),
  hazard: "heat",
  setHazard: (hazard) => {
    set({ hazard });
    get().loadHotspots();
    const s = get().selected;
    if (s) get().select(s.lat, s.lng);
  },
  basemap: "map",
  setBasemap: (basemap) => set({ basemap }),

  hotspots: [],
  async loadHotspots() {
    try {
      const r = await getHotspots(get().hazard, 8);
      set({ hotspots: r.hotspots });
    } catch {
      set({ hotspots: [] });
    }
  },

  selected: null,
  point: null,
  pointBusy: false,
  async select(lat, lng) {
    set({
      selected: { lat, lng },
      pointBusy: true,
      point: { lat, lng, area_name: "Selected Chennai cell", live: false, source: "loading", vulnerability: {} },
      reco: null,
      sim: null,
      prop: null,
      mix: {},
    });
    // live point
    try {
      set({ point: await getPoint(lat, lng) });
    } catch {
      /* keep provisional */
    } finally {
      set({ pointBusy: false });
    }
    // recommendation (parallel, non-blocking)
    const { hazard, budget } = get();
    set({ recoBusy: true, reco: null });
    apiRecommend(lat, lng, HAZARD_META[hazard].goal, budget)
      .then((reco) => {
        if (get().selected?.lat === lat && get().selected?.lng === lng) set({ reco });
      })
      .catch(() => set({ reco: null }))
      .finally(() => set({ recoBusy: false }));
  },
  clearSelection: () => set({ selected: null, point: null, reco: null, sim: null, prop: null, mix: {} }),

  reco: null,
  recoBusy: false,

  mix: {},
  budget: 500000,
  setBudget: (budget) => set({ budget }),
  bump: (key, delta) =>
    set((st) => ({ mix: { ...st.mix, [key]: Math.max(0, (st.mix[key] || 0) + delta) } })),
  loadRecoIntoMix: () => {
    const reco = get().reco;
    if (!reco) return;
    const m: Record<string, number> = {};
    reco.interventions.forEach((i) => {
      const item = PALETTE.find((p) => p.species === (i.species ?? i.type) || p.type === i.type);
      if (item) m[item.key] = i.count;
    });
    set({ mix: m });
  },
  sim: null,
  simBusy: false,
  async runSim() {
    const { selected, mix, budget } = get();
    if (!selected) return;
    const interventions = mixToInterventions(mix);
    if (!interventions.length) return;
    set({ simBusy: true });
    try {
      set({ sim: await apiSimulate(selected.lat, selected.lng, interventions, budget) });
    } catch {
      set({ sim: null });
    } finally {
      set({ simBusy: false });
    }
  },

  prop: null,
  propBusy: false,
  async runProposal() {
    const { selected, point, mix, sim, reco, hazard } = get();
    if (!selected) return;
    set({ propBusy: true });
    try {
      const interventions = mixToInterventions(mix);
      set({
        prop: await apiProposal(point?.area_name ?? "Selected area", {
          area: point?.area_name,
          hazard,
          goal: HAZARD_META[hazard].goal,
          interventions,
          effect: sim ?? reco?.effect,
        }),
      });
    } catch {
      set({ prop: null });
    } finally {
      set({ propBusy: false });
    }
  },
  closeProposal: () => set({ prop: null }),

  askAnswer: null,
  askBusy: false,
  async runAsk(q) {
    if (!q.trim()) return;
    set({ askBusy: true, askAnswer: null });
    try {
      set({ askAnswer: (await apiAsk(q)).answer });
    } catch {
      set({ askAnswer: "Couldn't reach the assistant right now." });
    } finally {
      set({ askBusy: false });
    }
  },
  clearAsk: () => set({ askAnswer: null }),

  scenarios: { A: null, B: null },
  saveScenario: (slot) => {
    const { sim, point, hazard } = get();
    if (!sim) return;
    const snap: Scenario = {
      label: point?.area_name ?? "Selected area",
      hazard,
      delta: sim.delta_feels_like_c,
      people: sim.people_helped,
      cost: sim.cost_inr,
    };
    set((st) => ({ scenarios: { ...st.scenarios, [slot]: snap } }));
  },
  clearScenarios: () => set({ scenarios: { A: null, B: null } }),

  hour: 15,
  playing: false,
  setHour: (hour) => set({ hour: ((hour % 24) + 24) % 24 }),
  togglePlay: () => set((st) => ({ playing: !st.playing })),
}));

export { asHazard };
