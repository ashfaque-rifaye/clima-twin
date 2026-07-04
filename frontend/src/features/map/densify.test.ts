import { describe, expect, it } from "vitest";
import { densify } from "./densify";

const anchor = (lat: number, lng: number, weight: number) => ({ lat, lng, weight });

describe("densify (IDW interpolation)", () => {
  it("returns empty for no input", () => {
    expect(densify([])).toEqual([]);
  });

  it("stays anchored: interpolated weights never exceed the sample range", () => {
    const grid = [anchor(12.9, 80.15, 0.2), anchor(13.2, 80.3, 0.9)];
    const cells = densify(grid, 20);
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) {
      expect(c.weight).toBeGreaterThanOrEqual(0.06); // crispness threshold
      expect(c.weight).toBeLessThanOrEqual(0.9 + 1e-9);
    }
  });

  it("cells near a hot anchor are hotter than cells near a cool anchor", () => {
    const grid = [anchor(13.2, 80.15, 1.0), anchor(12.85, 80.3, 0.1)];
    const cells = densify(grid, 30);
    const nearHot = cells.filter((c) => c.lat > 13.15 && c.lng < 80.2);
    const nearCool = cells.filter((c) => c.lat < 12.9 && c.lng > 80.26);
    const mean = (xs: { weight: number }[]) => xs.reduce((a, b) => a + b.weight, 0) / xs.length;
    expect(mean(nearHot)).toBeGreaterThan(mean(nearCool));
  });

  it("drops near-zero cells to keep the field lean", () => {
    const grid = [anchor(13.0, 80.2, 0.01)];
    expect(densify(grid, 10).length).toBe(0);
  });
});
