/**
 * Review-response round 4 — the five findings from the Codex review of
 * c985803 that were dropped when the review rounds were mislabelled, surfaced
 * again by Claude's static pass. Two are P1s in the AC surface.
 */

import { describe, it, expect } from "vitest";
import { normalizeUnit } from "./unit-normalizer";
import { parseQuantity } from "./quantity-parser";
import { convert } from "./measurement-converter";

describe("review4 · uppercase T is surfaced as ambiguous, not guessed (P1, AC1)", () => {
  it("T → ambiguous, tbsp-leaning", () => {
    const r = normalizeUnit("T");
    expect(r.ambiguous).toBe(true);
    expect(r.candidates).toEqual(expect.arrayContaining(["tbsp", "tsp"]));
    expect(r.candidates?.[0]).toBe("tbsp"); // capital conventionally tablespoon
    expect(r.confidence).toBeLessThan(0.8);
  });
  it("t stays teaspoon-leaning ambiguous", () => {
    expect(normalizeUnit("t").candidates?.[0]).toBe("tsp");
  });
});

describe("review4 · gas mark → Fahrenheit reads the table, not the formula (P1, AC5)", () => {
  it.each([
    [4, 350],
    [6, 400],
    [1, 275],
    [9, 475],
  ])("Gas %s → %s°F (table), not the C→F formula", (gas, f) => {
    expect(convert({ quantity: gas, fromUnit: "gas_mark", toUnit: "fahrenheit" }).convertedQuantity).toBe(f);
  });
  it("gas mark → Celsius still reads the table", () => {
    expect(convert({ quantity: 4, fromUnit: "gas_mark", toUnit: "celsius" }).convertedQuantity).toBe(180);
  });
});

describe("review4 · article-led package sizes don't fabricate a quantity (P1)", () => {
  it("'a 400g can' → 1 (the can), not 400", () => {
    const r = parseQuantity("a 400g can");
    expect(r.value).toBe(1);
    expect(r.value).not.toBe(400);
  });
  it("'a 500ml bottle' → 1", () => {
    expect(parseQuantity("a 500ml bottle").value).toBe(1);
  });
  it("but 'a 1/2 cup' keeps its genuine fractional quantity", () => {
    expect(parseQuantity("a 1/2 cup").value).toBeCloseTo(0.5, 5);
  });
});

describe("review4 · explicit toUnit is authoritative over targetSystem (P2)", () => {
  it("cup→cup with targetSystem:metric keeps the US cup (toUnit wins)", () => {
    // 1 US cup → US cup is 1, not silently reinterpreted as a 250ml metric cup.
    const r = convert({ quantity: 1, fromUnit: "cup", toUnit: "cup", targetSystem: "metric" });
    expect(r.convertedQuantity).toBeCloseTo(1, 6);
  });
  it("targetSystem still drives unit choice when no toUnit is given", () => {
    expect(convert({ quantity: 1, fromUnit: "kg", targetSystem: "us" }).convertedUnit).toBe("oz");
  });
});

describe("review4 · fraction range endpoints parse (P2)", () => {
  it("'½ to 1' → range {0.5, 1}", () => {
    const r = parseQuantity("½ to 1");
    expect(r.isRange).toBe(true);
    expect(r.value).toBeCloseTo(0.5, 5);
    expect(r.max).toBeCloseTo(1, 5);
  });
  it("'1 to 1½' → range {1, 1.5}", () => {
    const r = parseQuantity("1 to 1½");
    expect(r.isRange).toBe(true);
    expect(r.value).toBeCloseTo(1, 5);
    expect(r.max).toBeCloseTo(1.5, 5);
  });
});
