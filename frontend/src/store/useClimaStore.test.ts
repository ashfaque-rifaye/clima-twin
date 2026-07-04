import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/api", () => ({
  getConfig: vi.fn(async () => ({ maps_api_key: "k", has_maps: true })),
  getHotspots: vi.fn(async () => ({ hazard: "heat", hotspots: [], source: "t" })),
  getPoint: vi.fn(async (lat: number, lng: number) => ({
    lat, lng, area_name: "T. Nagar", live: true, source: "live", vulnerability: {},
  })),
  recommend: vi.fn(async () => ({
    goal: "g", interventions: [{ type: "tree", species: "pungai", count: 40 }],
    effect: {}, rationale: "r", trade_offs: [], source: "rule-based",
  })),
  simulate: vi.fn(async () => ({
    delta_feels_like_c: 4.2, cooled_area_m2: 1, people_helped: 1800, cost_inr: 250000,
    over_budget: false, confidence: "c", what_could_go_wrong: [], source: "t",
  })),
  ask: vi.fn(async () => ({ answer: "a", source: "t" })),
  proposal: vi.fn(async () => ({ title: "t", markdown: "m", source: "t" })),
}));

import * as api from "../services/api";
import { useClimaStore } from "./useClimaStore";

const initial = useClimaStore.getState();

beforeEach(() => {
  useClimaStore.setState(initial, true);
  vi.clearAllMocks();
});

describe("select", () => {
  it("loads live point data and a recommendation", async () => {
    await useClimaStore.getState().select(13.04, 80.23);
    await vi.waitFor(() => {
      expect(useClimaStore.getState().reco).not.toBeNull();
    });
    const s = useClimaStore.getState();
    expect(s.point?.area_name).toBe("T. Nagar");
    expect(s.pointError).toBe(false);
    expect(s.pointBusy).toBe(false);
  });

  it("flags pointError on failure but keeps the provisional card", async () => {
    vi.mocked(api.getPoint).mockRejectedValueOnce(new Error("down"));
    await useClimaStore.getState().select(13.04, 80.23);
    const s = useClimaStore.getState();
    expect(s.pointError).toBe(true);
    expect(s.point?.source).toBe("loading"); // provisional retained
  });

  it("ignores stale responses after a rapid second click", async () => {
    let release!: (v: unknown) => void;
    vi.mocked(api.getPoint)
      .mockImplementationOnce(() => new Promise((res) => { release = res; }) as never);
    const first = useClimaStore.getState().select(13.0, 80.2);
    await useClimaStore.getState().select(13.9, 80.9); // newer selection wins
    release({ lat: 13.0, lng: 80.2, area_name: "STALE", live: true, source: "live", vulnerability: {} });
    await first;
    expect(useClimaStore.getState().point?.area_name).not.toBe("STALE");
  });
});

describe("simulate flow", () => {
  it("runs a simulation from the loaded reco mix", async () => {
    await useClimaStore.getState().select(13.04, 80.23);
    await vi.waitFor(() => expect(useClimaStore.getState().reco).not.toBeNull());
    useClimaStore.getState().loadRecoIntoMix();
    expect(Object.keys(useClimaStore.getState().mix).length).toBeGreaterThan(0);
    await useClimaStore.getState().runSim();
    const s = useClimaStore.getState();
    expect(s.sim?.delta_feels_like_c).toBe(4.2);
    expect(s.simError).toBe(false);
  });

  it("sets simError when the API fails", async () => {
    await useClimaStore.getState().select(13.04, 80.23);
    useClimaStore.setState({ mix: { pungai: 40 } });
    vi.mocked(api.simulate).mockRejectedValueOnce(new Error("down"));
    await useClimaStore.getState().runSim();
    expect(useClimaStore.getState().simError).toBe(true);
    expect(useClimaStore.getState().sim).toBeNull();
  });
});

describe("scenarios", () => {
  it("saves and clears A/B snapshots", async () => {
    await useClimaStore.getState().select(13.04, 80.23);
    useClimaStore.setState({ mix: { pungai: 40 } });
    await useClimaStore.getState().runSim();
    useClimaStore.getState().saveScenario("A");
    expect(useClimaStore.getState().scenarios.A?.people).toBe(1800);
    useClimaStore.getState().clearScenarios();
    expect(useClimaStore.getState().scenarios.A).toBeNull();
  });
});

describe("timeline", () => {
  it("wraps hours into 0..23", () => {
    useClimaStore.getState().setHour(26);
    expect(useClimaStore.getState().hour).toBe(2);
    useClimaStore.getState().setHour(-1);
    expect(useClimaStore.getState().hour).toBe(23);
  });
});
