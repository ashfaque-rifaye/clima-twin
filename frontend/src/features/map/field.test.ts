import { describe, expect, it } from "vitest";
import { blur, maskAt, rampColor, sampleBilinear, sampleIDW, toSampleGrid, type Bounds } from "./field";
import { coastLngAt } from "./geo";

const RAMP: [number, number, number, number][] = [
  [0, 0, 0, 0], [255, 0, 0, 128], [255, 255, 255, 255],
];

describe("rampColor", () => {
  it("hits the stops exactly", () => {
    expect(rampColor(0, RAMP)).toEqual([0, 0, 0, 0]);
    expect(rampColor(0.5, RAMP)).toEqual([255, 0, 0, 128]);
    expect(rampColor(1, RAMP)).toEqual([255, 255, 255, 255]);
  });
  it("interpolates colour AND alpha between stops", () => {
    const [r, , , a] = rampColor(0.25, RAMP);
    expect(r).toBeCloseTo(127.5, 0);
    expect(a).toBeCloseTo(64, 0);
  });
  it("clamps out-of-range values", () => {
    expect(rampColor(-5, RAMP)).toEqual([0, 0, 0, 0]);
    expect(rampColor(99, RAMP)).toEqual([255, 255, 255, 255]);
  });
});

describe("toSampleGrid + sampleBilinear", () => {
  const pts = [
    { lat: 13.0, lng: 80.0, weight: 0 }, { lat: 13.0, lng: 80.2, weight: 1 },
    { lat: 13.2, lng: 80.0, weight: 0 }, { lat: 13.2, lng: 80.2, weight: 1 },
  ];
  it("recognises a regular lattice", () => {
    expect(toSampleGrid(pts)).not.toBeNull();
  });
  it("rejects irregular samples", () => {
    expect(toSampleGrid(pts.slice(0, 3))).toBeNull();
  });
  it("interpolates linearly between samples", () => {
    const g = toSampleGrid(pts)!;
    expect(sampleBilinear(g, 13.1, 80.0)).toBeCloseTo(0, 5);
    expect(sampleBilinear(g, 13.1, 80.2)).toBeCloseTo(1, 5);
    expect(sampleBilinear(g, 13.1, 80.1)).toBeCloseTo(0.5, 5);
  });
});

describe("sampleIDW", () => {
  it("returns the exact value at a sample point", () => {
    const pts = [{ lat: 13, lng: 80, weight: 0.7 }, { lat: 13.1, lng: 80.1, weight: 0.1 }];
    expect(sampleIDW(pts, 13, 80)).toBe(0.7);
  });
  it("weights nearer samples more", () => {
    const pts = [{ lat: 13, lng: 80, weight: 1 }, { lat: 13.2, lng: 80.2, weight: 0 }];
    expect(sampleIDW(pts, 13.01, 80.01)).toBeGreaterThan(0.9);
  });
});

describe("maskAt (coastline land mask + edge fade)", () => {
  const b: Bounds = [80.15, 12.84, 80.34, 13.24];
  it("is opaque well inland", () => {
    expect(maskAt(13.05, 80.22, b)).toBe(1);
  });
  it("is zero over the sea", () => {
    // Bay of Bengal, east of the Marina shoreline (~80.286 at lat 13.05)
    expect(maskAt(13.05, 80.31, b)).toBe(0);
  });
  it("fades softly at the shoreline", () => {
    const shore = coastLngAt(13.05);
    const v = maskAt(13.05, shore - 0.003, b);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });
  it("fades at the inland data border (no hard rectangle)", () => {
    expect(maskAt(13.05, 80.152, b)).toBeLessThan(0.2);
  });
});

describe("blur", () => {
  it("smooths a spike while preserving locality", () => {
    const w = 9, h = 9;
    const buf = new Float32Array(w * h);
    buf[4 * w + 4] = 1;
    const out = blur(buf, w, h);
    expect(out[4 * w + 4]).toBeLessThan(1);
    expect(out[4 * w + 4]).toBeGreaterThan(out[4 * w + 6]);
    expect(out[0]).toBeCloseTo(0, 5);
  });
});

describe("coastLngAt", () => {
  it("is monotonic-ish north→south and within Chennai's range", () => {
    for (const lat of [13.2, 13.1, 13.0, 12.9]) {
      const lng = coastLngAt(lat);
      expect(lng).toBeGreaterThan(80.24);
      expect(lng).toBeLessThan(80.33);
    }
  });
  it("clamps beyond the digitized extent", () => {
    expect(coastLngAt(13.5)).toBe(80.32);
    expect(coastLngAt(12.5)).toBe(80.246);
  });
});
