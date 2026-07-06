import { create } from "zustand";
import {
  ask as apiAsk,
  generateReport,
  getConfig,
  getHotspots,
  getInterventions,
  getPoint,
  optimize as apiOptimize,
  proposal as apiProposal,
  recommend as apiRecommend,
  reportDocx,
  simulate as apiSimulate,
  type Hotspot,
  type InterventionItem,
  type OptimizeResult,
  type PointData,
  type ProposalResp,
  type Recommendation,
  type SimInterv,
  type SimResult,
} from "../services/api";
import { asHazard, HAZARD_META, type HazardId } from "../features/hazards/hazardMeta";
import { PALETTE } from "../features/simulation/palette";

export type Basemap = "map" | "satellite";
export type AppView = "planner" | "citizen";
export type BudgetMode = "manual" | "optimize";

/** Build the /simulate payload from a mix, resolving each key's category from
 *  the active catalogue (falling back to the static palette). */
function toInterventions(mix: Record<string, number>, catalogue: InterventionItem[]): SimInterv[] {
  return Object.entries(mix)
    .filter(([, c]) => c > 0)
    .map(([key, count]) => {
      const type = catalogue.find((i) => i.key === key)?.type ??
        PALETTE.find((p) => p.key === key)?.type ?? "";
      return { type, species: key, count };
    });
}

/** Assemble the /report plan payload — preferring an AI budget plan (opt),
 *  else the current simulated mix. Returns null until there's something to report. */
function buildReportPlan(s: {
  opt: OptimizeResult | null; sim: SimResult | null;
  mix: Record<string, number>; catalogue: InterventionItem[];
}): Record<string, unknown> | null {
  if (s.opt) {
    return {
      interventions: s.opt.interventions, impacts: s.opt.impacts, costs: s.opt.costs,
      budget: s.opt.budget, trade_offs: s.opt.trade_offs, assumptions: s.opt.assumptions,
      confidence: s.opt.confidence,
    };
  }
  if (s.sim) {
    const interventions = Object.entries(s.mix)
      .filter(([, c]) => c > 0)
      .map(([key, count]) => {
        const item = s.catalogue.find((i) => i.key === key);
        return { name: item?.name ?? key, species: key, count, capital_inr: (item?.capital_inr ?? 0) * count, why: "" };
      });
    return {
      interventions, impacts: s.sim.impacts, costs: s.sim.costs,
      trade_offs: s.sim.what_could_go_wrong, confidence: s.sim.confidence_detail,
    };
  }
  return null;
}

/** A saved simulation snapshot for A/B/C scenario comparison (multi-metric). */
export interface Scenario {
  label: string;
  hazard: HazardId;
  delta: number;
  people: number;
  cost: number;
  aqi?: number;
  flood?: number;
  canopy?: number;
  carbon?: number;
  maintenance?: number;
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
  pointError: boolean;
  select: (lat: number, lng: number) => Promise<void>;
  retryPoint: () => void;
  clearSelection: () => void;

  /* context-aware intervention catalogue (per hazard) */
  catalogue: InterventionItem[];
  catalogueBusy: boolean;
  loadCatalogue: () => Promise<void>;

  /* recommendation */
  reco: Recommendation | null;
  recoBusy: boolean;

  /* simulation */
  mix: Record<string, number>;
  budget: number;
  setBudget: (n: number) => void;
  budgetMode: BudgetMode;
  setBudgetMode: (m: BudgetMode) => void;
  bump: (key: string, delta: number) => void;
  loadRecoIntoMix: () => void;
  sim: SimResult | null;
  simBusy: boolean;
  simError: boolean;
  runSim: () => Promise<void>;

  /* budget optimiser (Workflow B: fixed budget → optimal plan) */
  opt: OptimizeResult | null;
  optBusy: boolean;
  optError: boolean;
  runOptimize: () => Promise<void>;

  /* proposal (legacy markdown) */
  prop: ProposalResp | null;
  propBusy: boolean;
  propError: boolean;
  runProposal: () => Promise<void>;
  closeProposal: () => void;

  /* professional planning report (Parts 7–9) */
  reportBusy: boolean;
  reportError: boolean;
  reportHtml: string | null;
  reportTitle: string | null;
  runReport: () => Promise<void>;
  openReport: () => void;
  downloadReportDocx: () => Promise<void>;

  /* ask */
  askAnswer: string | null;
  askBusy: boolean;
  runAsk: (q: string) => Promise<void>;
  clearAsk: () => void;

  /* scenario compare (A/B/C, multi-metric) */
  scenarios: { A: Scenario | null; B: Scenario | null; C: Scenario | null };
  saveScenario: (slot: "A" | "B" | "C") => void;
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
    // Only adopt the backend-served key when no env key exists (production
    // build) — swapping keys after mount double-loads the Maps script.
    if (get().mapsKey) return;
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
    set({ hazard, sim: null, opt: null, mix: {}, reportHtml: null });
    get().loadHotspots();
    get().loadCatalogue();
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

  catalogue: [],
  catalogueBusy: false,
  async loadCatalogue() {
    set({ catalogueBusy: true });
    try {
      const r = await getInterventions(get().hazard);
      set({ catalogue: r.interventions });
    } catch {
      set({ catalogue: [] });
    } finally {
      set({ catalogueBusy: false });
    }
  },

  selected: null,
  point: null,
  pointBusy: false,
  pointError: false,
  async select(lat, lng) {
    set({
      selected: { lat, lng },
      pointBusy: true,
      pointError: false,
      point: { lat, lng, area_name: "Selected Chennai cell", live: false, source: "loading", vulnerability: {} },
      reco: null,
      sim: null,
      simError: false,
      prop: null,
      propError: false,
      mix: {},
      opt: null,
      reportHtml: null,
      reportError: false,
    });
    const stillCurrent = () => get().selected?.lat === lat && get().selected?.lng === lng;
    // live point
    try {
      const p = await getPoint(lat, lng);
      if (stillCurrent()) set({ point: p, pointError: false });
    } catch {
      // keep the provisional card, but tell the user live data didn't arrive
      if (stillCurrent()) set({ pointError: true });
    } finally {
      if (stillCurrent()) set({ pointBusy: false });
    }
    // recommendation (parallel, non-blocking)
    const { hazard, budget } = get();
    set({ recoBusy: true, reco: null });
    apiRecommend(lat, lng, HAZARD_META[hazard].goal, budget)
      .then((reco) => {
        if (stillCurrent()) set({ reco });
      })
      .catch(() => { if (stillCurrent()) set({ reco: null }); })
      .finally(() => { if (stillCurrent()) set({ recoBusy: false }); });
  },
  retryPoint: () => {
    const s = get().selected;
    if (s) void get().select(s.lat, s.lng);
  },
  clearSelection: () =>
    set({ selected: null, point: null, pointError: false, reco: null, sim: null, simError: false, prop: null, propError: false, mix: {} }),

  reco: null,
  recoBusy: false,

  mix: {},
  budget: 5_000_000,
  setBudget: (budget) => set({ budget }),
  budgetMode: "manual",
  setBudgetMode: (budgetMode) => set({ budgetMode }),
  bump: (key, delta) =>
    set((st) => ({ mix: { ...st.mix, [key]: Math.max(0, (st.mix[key] || 0) + delta) } })),
  loadRecoIntoMix: () => {
    const reco = get().reco;
    if (!reco) return;
    const m: Record<string, number> = {};
    reco.interventions.forEach((i) => {
      const key = i.species ?? i.type;
      if (key) m[key] = i.count;
    });
    set({ mix: m });
  },
  sim: null,
  simBusy: false,
  simError: false,
  async runSim() {
    const { selected, mix, budget, catalogue } = get();
    if (!selected) return;
    const interventions = toInterventions(mix, catalogue);
    if (!interventions.length) return;
    set({ simBusy: true, simError: false });
    try {
      set({ sim: await apiSimulate(selected.lat, selected.lng, interventions, budget) });
    } catch {
      set({ sim: null, simError: true });
    } finally {
      set({ simBusy: false });
    }
  },

  opt: null,
  optBusy: false,
  optError: false,
  async runOptimize() {
    const { selected, hazard, budget } = get();
    if (!selected) return;
    set({ optBusy: true, optError: false });
    try {
      const opt = await apiOptimize(selected.lat, selected.lng, hazard, budget, HAZARD_META[hazard].goal);
      // Load the optimised plan into the mix so the planner can review, tweak and simulate it.
      const m: Record<string, number> = {};
      opt.interventions.forEach((i) => { m[i.species] = i.count; });
      set({ opt, mix: m });
    } catch {
      set({ opt: null, optError: true });
    } finally {
      set({ optBusy: false });
    }
  },

  prop: null,
  propBusy: false,
  propError: false,
  async runProposal() {
    const { selected, point, mix, sim, reco, hazard } = get();
    if (!selected) return;
    set({ propBusy: true, propError: false });
    try {
      const interventions = toInterventions(mix, get().catalogue);
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
      set({ prop: null, propError: true });
    } finally {
      set({ propBusy: false });
    }
  },
  closeProposal: () => set({ prop: null }),

  reportBusy: false,
  reportError: false,
  reportHtml: null,
  reportTitle: null,
  async runReport() {
    const st = get();
    const { selected, point, hazard } = st;
    if (!selected) return;
    const plan = buildReportPlan(st);
    if (!plan) return; // need a simulation or an AI plan first
    set({ reportBusy: true, reportError: false, reportHtml: null });
    try {
      const res = await generateReport({
        area_name: point?.area_name ?? "Selected area",
        lat: selected.lat, lng: selected.lng, hazard, point: point ?? {}, plan,
      });
      set({ reportHtml: res.html, reportTitle: res.title, reportBusy: false });
    } catch {
      set({ reportError: true, reportBusy: false });
    }
  },
  openReport() {
    const html = get().reportHtml;
    if (!html) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  },
  async downloadReportDocx() {
    const st = get();
    const { selected, point, hazard } = st;
    if (!selected) return;
    const plan = buildReportPlan(st);
    if (!plan) return;
    try {
      const blob = await reportDocx({
        area_name: point?.area_name ?? "Selected area",
        lat: selected.lat, lng: selected.lng, hazard, point: point ?? {}, plan,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ClimaTwin-Report-${(point?.area_name ?? "area").replace(/[^a-z0-9]+/gi, "-")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      set({ reportError: true });
    }
  },

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

  scenarios: { A: null, B: null, C: null },
  saveScenario: (slot) => {
    const { sim, point, hazard } = get();
    if (!sim) return;
    const imp = sim.impacts;
    const snap: Scenario = {
      label: point?.area_name ?? "Selected area",
      hazard,
      delta: sim.delta_feels_like_c,
      people: sim.people_helped,
      cost: sim.cost_inr,
      aqi: imp?.aqi_improvement,
      flood: imp?.flood_managed_m3,
      canopy: imp?.canopy_added_m2,
      carbon: imp?.carbon_seq_kg_year,
      maintenance: sim.costs?.maintenance_inr_year,
    };
    set((st) => ({ scenarios: { ...st.scenarios, [slot]: snap } }));
  },
  clearScenarios: () => set({ scenarios: { A: null, B: null, C: null } }),

  hour: 15,
  playing: false,
  setHour: (hour) => set({ hour: ((hour % 24) + 24) % 24 }),
  togglePlay: () => set((st) => ({ playing: !st.playing })),
}));

export { asHazard };
