import { describe, expect, it } from "vitest";
import { aqiClass, coordText, diurnalDeltaC, hourLabel, mdToHtml, ndviLabel } from "./format";

describe("coordText", () => {
  it("formats the mockup style", () => {
    expect(coordText(13.0827, 80.2707)).toBe("13.0827° N, 80.2707° E");
  });
  it("handles southern/western hemispheres", () => {
    expect(coordText(-33.86, -151.2)).toBe("33.8600° S, 151.2000° W");
  });
});

describe("aqiClass", () => {
  it("buckets severity", () => {
    expect(aqiClass(30)).toBe("good");
    expect(aqiClass(100)).toBe("mod");
    expect(aqiClass(150)).toBe("poor");
    expect(aqiClass(200)).toBe("bad");
    expect(aqiClass(300)).toBe("sev");
    expect(aqiClass(undefined)).toBe("");
  });
});

describe("hourLabel", () => {
  it("pads and wraps", () => {
    expect(hourLabel(6)).toBe("06:00");
    expect(hourLabel(25)).toBe("01:00");
    expect(hourLabel(-1)).toBe("23:00");
  });
});

describe("diurnalDeltaC", () => {
  it("peaks at 15:00 and dips ~03:00", () => {
    expect(diurnalDeltaC(15)).toBeCloseTo(3.5, 1);
    expect(diurnalDeltaC(3)).toBeCloseTo(-3.5, 1);
  });
});

describe("ndviLabel", () => {
  it("labels vegetation bands", () => {
    expect(ndviLabel(0.1)).toBe("Low");
    expect(ndviLabel(0.3)).toBe("Moderate");
    expect(ndviLabel(0.6)).toBe("High");
    expect(ndviLabel(undefined)).toBe("n/a");
  });
});

describe("mdToHtml", () => {
  it("renders headings, bold and bullets", () => {
    const html = mdToHtml("# Title\n\n## Section\nBody **bold** text.\n\n- one\n- two");
    expect(html).toContain("<h3>Title</h3>");
    expect(html).toContain("<h4>Section</h4>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
  });
  it("escapes raw HTML before rendering", () => {
    const html = mdToHtml("hello <script>alert(1)</script> **world**");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<strong>world</strong>");
  });
});
