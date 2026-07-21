/**
 * Review-response round 2 — pins the three new findings from Codex's second
 * pass on PR #21 (reviewing 2b68274): exact-system approximate flag, `gm`
 * ambiguity, and invalid range upper bounds.
 */

import { describe, it, expect } from "vitest";
import { normalizeUnit } from "./unit-normalizer";
import { convert } from "./measurement-converter";

describe("review2 · system-targeted exact conversions are not flagged approximate (N1)", () => {
  it("1 kg → US (oz) is exact, not approximate", () => {
    const r = convert({ quantity: 1, fromUnit: "kg", targetSystem: "us" });
    expect(r.convertedUnit).toBe("oz");
    expect(r.approximate).toBe(false);
    expect(r.confidence).toBe("exact");
  });
  it("180°C → US (°F) is exact, not approximate", () => {
    const r = convert({ quantity: 180, fromUnit: "celsius", targetSystem: "us" });
    expect(r.convertedUnit).toBe("fahrenheit");
    expect(r.convertedQuantity).toBeCloseTo(356, 6);
    expect(r.approximate).toBe(false);
  });
  it("a gas-mark target is still correctly approximate", () => {
    const r = convert({ quantity: 160, fromUnit: "celsius", toUnit: "gas_mark" });
    expect(r.approximate).toBe(true);
  });
});

describe("review2 · gm ambiguity is surfaced (N2)", () => {
  it.each(["gm", "GM"])("normalises %s as ambiguous g / gas_mark", (input) => {
    const r = normalizeUnit(input);
    expect(r.ambiguous).toBe(true);
    expect(r.candidates).toEqual(expect.arrayContaining(["g", "gas_mark"]));
    expect(r.confidence).toBeLessThan(0.8);
  });
  it("unambiguous grams aliases still resolve cleanly", () => {
    expect(normalizeUnit("g").unit).toBe("g");
    expect(normalizeUnit("grams").unit).toBe("g");
  });
});

describe("review2 · invalid range upper bounds are rejected (N3)", () => {
  it("rejects an infinite max instead of returning a corrupt partial range", () => {
    const r = convert({ quantity: 200, quantityMax: Infinity, fromUnit: "g", toUnit: "oz" });
    expect(r.error).toBe("INVALID_QUANTITY");
    expect(r.convertedQuantity).toBeUndefined();
  });
  it("rejects a negative max for a non-temperature dimension", () => {
    expect(convert({ quantity: 200, quantityMax: -50, fromUnit: "g", toUnit: "oz" }).error).toBe("INVALID_QUANTITY");
  });
  it("still accepts a valid negative temperature range", () => {
    const r = convert({ quantity: -20, quantityMax: -15, fromUnit: "celsius", toUnit: "fahrenheit" });
    expect(r.error).toBeUndefined();
    expect(r.convertedQuantityMax).toBeCloseTo(5, 6);
  });
});
