/**
 * Review-response round 5 — Codex's passes on 49bbaca. Temperature/gas-mark
 * accuracy, fractional pan dimensions, sub-milligram masses, and trailing-dot
 * ambiguity.
 */

import { describe, it, expect } from "vitest";
import { normalizeUnit } from "./unit-normalizer";
import { convert } from "./measurement-converter";
import { selectFriendlyMass } from "./quantity-formatter";

describe("review5 · Fahrenheit → gas mark uses the °F column (P1)", () => {
  it("364°F → Gas 5 (nearest by °F: 375 is closer than 350), not Gas 4", () => {
    expect(convert({ quantity: 364, fromUnit: "fahrenheit", toUnit: "gas_mark" }).convertedQuantity).toBe(5);
  });
  it("350°F → Gas 4 exactly (table °F)", () => {
    const r = convert({ quantity: 350, fromUnit: "fahrenheit", toUnit: "gas_mark" });
    expect(r.convertedQuantity).toBe(4);
    expect(r.approximate).toBe(false); // exact table hit
  });
});

describe("review5 · exact gas-mark lookups are not approximate", () => {
  it("180°C → Gas 4 is exact, and survives allowApproximate:false", () => {
    const r = convert({ quantity: 180, fromUnit: "celsius", toUnit: "gas_mark", allowApproximate: false });
    expect(r.error).toBeUndefined();
    expect(r.convertedQuantity).toBe(4);
    expect(r.approximate).toBe(false);
    expect(r.confidence).toBe("exact");
  });
  it("175°C (off-table) → approximate, and refused when exact-only", () => {
    expect(convert({ quantity: 175, fromUnit: "celsius", toUnit: "gas_mark" }).approximate).toBe(true);
    expect(convert({ quantity: 175, fromUnit: "celsius", toUnit: "gas_mark", allowApproximate: false }).error).toBe(
      "UNSUPPORTED_CONVERSION",
    );
  });
});

describe("review5 · sub-milligram mass is not rounded to zero (P2)", () => {
  it("selectFriendlyMass(0.0004) keeps a non-zero mg value", () => {
    const r = selectFriendlyMass(0.0004);
    expect(r.unit).toBe("mg");
    expect(r.value).toBeCloseTo(0.4, 6);
    expect(r.value).not.toBe(0);
  });
});

describe("review5 · trailing-dot ambiguity is preserved (P2)", () => {
  it.each([
    ["T.", "tbsp"],
    ["c.", "cup"],
    ["t.", "tsp"],
  ])("%s stays ambiguous (leads with %s)", (input, lead) => {
    const r = normalizeUnit(input);
    expect(r.ambiguous).toBe(true);
    expect(r.candidates?.[0]).toBe(lead);
  });
  it("unambiguous abbreviations with a dot still resolve", () => {
    expect(normalizeUnit("tbsp.").unit).toBe("tbsp");
  });
});
