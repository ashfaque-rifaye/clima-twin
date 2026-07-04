// Formatting + small pure helpers shared across the UI.

export type HazardId = "heat" | "flood" | "air";

const inr = new Intl.NumberFormat("en-IN");

export const fmtInt = (n: number) => inr.format(Math.round(n));
export const fmtINR = (n: number) => `₹${inr.format(Math.round(n))}`;

export const asHazard = (value: string): HazardId =>
  value === "flood" || value === "air" ? value : "heat";

/** AQI severity bucket → semantic class suffix. */
export const aqiClass = (a?: number): string =>
  a == null ? "" : a <= 50 ? "good" : a <= 100 ? "mod" : a <= 150 ? "poor" : a <= 200 ? "bad" : "sev";

export const ndviLabel = (v?: number): string =>
  v == null ? "n/a" : v < 0.2 ? "Low" : v < 0.4 ? "Moderate" : "High";

/** Mockup coordinate format: "13.0827° N, 80.2707° E". */
export const coordText = (lat: number, lng: number): string =>
  `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? "E" : "W"}`;

/** 24h index → "06:00" style diurnal label for the scenario timeline. */
export const hourLabel = (h: number): string => `${String(((h % 24) + 24) % 24).padStart(2, "0")}:00`;

/** AQI severity bucket suffix (used for `aqi-*` colour classes). */
export const aqiBand = aqiClass;

/**
 * Diurnal temperature offset (°C) for the scenario clock — warmest ~15:00,
 * coolest ~03:00, ±3.5 °C around the live reading. Used to project how the
 * selected point's feels-like shifts across the day.
 */
export const diurnalDeltaC = (h: number): number =>
  +(Math.cos(((h - 15) / 24) * Math.PI * 2) * 3.5).toFixed(1);
