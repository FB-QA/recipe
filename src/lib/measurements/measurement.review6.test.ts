/**
 * Review-response round 6 — Codex on c9bbd8d: gas-mark range approximate leak,
 * and the compact hyphenated dimension form. Plus a documented-limitation pin
 * for hyphen-separated dimension RANGES (out of AC6 scope; safe empty result).
 */

import { describe, it, expect } from "vitest";
import { parseDimensions } from "./quantity-parser";
import { convert } from "./measurement-converter";

describe("review6 · gas-mark ranges: either endpoint off-table ⇒ approximate", () => {
  it("180–185°C → approximate (upper snapped from a non-table temp)", () => {
    const r = convert({ quantity: 180, quantityMax: 185, fromUnit: "celsius", toUnit: "gas_mark" });
    expect(r.approximate).toBe(true);
    expect(r.convertedQuantity).toBe(4);
    expect(r.convertedQuantityMax).toBe(4);
  });
  it("180–190°C → exact (both endpoints on-table)", () => {
    const r = convert({ quantity: 180, quantityMax: 190, fromUnit: "celsius", toUnit: "gas_mark" });
    expect(r.approximate).toBe(false);
    expect(r.convertedQuantityMax).toBe(5);
  });
  it("an off-table range is refused under allowApproximate:false", () => {
    expect(
      convert({ quantity: 180, quantityMax: 185, fromUnit: "celsius", toUnit: "gas_mark", allowApproximate: false })
        .error,
    ).toBe("UNSUPPORTED_CONVERSION");
  });
});

describe("review6 · compact hyphenated dimensions parse (P2)", () => {
  it("'8-inch' → [8]", () => {
    expect(parseDimensions("8-inch")).toEqual({ values: [8], unitText: "inch" });
  });
  it("'8½-inch' keeps the fraction", () => {
    expect(parseDimensions("8½-inch")).toEqual({ values: [8.5], unitText: "inch" });
  });
  it("multi-dimension and plain single still parse", () => {
    expect(parseDimensions("20 × 30 cm")).toEqual({ values: [20, 30], unitText: "cm" });
    expect(parseDimensions("20 cm")).toEqual({ values: [20], unitText: "cm" });
  });

  // Documented limitation: a hyphen-separated dimension RANGE ("20-30 cm") is
  // not an AC6 form (AC6 is single or × multi-dimension). It returns no values
  // — safe (caller keeps the original), never a fabricated dimension.
  it("hyphen dimension range yields no values (safe, not fabricated)", () => {
    expect(parseDimensions("20-30 cm")).toEqual({ values: [], unitText: "cm" });
  });
});
