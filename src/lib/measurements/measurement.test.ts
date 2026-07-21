import { describe, it, expect } from "vitest";
import { normalizeUnit } from "./unit-normalizer";
import { parseQuantity } from "./quantity-parser";
import { convert } from "./measurement-converter";
import {
  friendlyFraction,
  formatQuantityValue,
  selectFriendlyMass,
  selectFriendlyVolume,
  roundForDisplay,
  practicalTinInches,
} from "./quantity-formatter";

// ------------------------------------------------------------------
// AC1 — unit normalisation (§16, §43)
// ------------------------------------------------------------------
describe("normalizeUnit", () => {
  it.each([
    ["grams", "g"],
    ["gram", "g"],
    ["g", "g"],
    ["kilograms", "kg"],
    ["kilo", "kg"],
    ["lbs", "lb"],
    ["ounces", "oz"],
    ["tablespoons", "tbsp"],
    ["tbsp.", "tbsp"],
    ["Tbsp", "tbsp"],
    ["millilitres", "ml"],
    ["milliliters", "ml"],
    ["fl oz", "fl_oz"],
    ["fl. oz.", "fl_oz"],
    ["cups", "cup"],
    ["°C", "celsius"],
    ["inches", "inch"],
  ])("normalises %s → %s with high confidence", (input, expected) => {
    const r = normalizeUnit(input);
    expect(r.unit).toBe(expected);
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it("trims whitespace and strips trailing dots", () => {
    expect(normalizeUnit("  grams. ").unit).toBe("g");
  });

  it("flags t / T as ambiguous rather than guessing", () => {
    const lower = normalizeUnit("t");
    expect(lower.ambiguous).toBe(true);
    expect(lower.confidence).toBeLessThan(0.6);
    expect(lower.candidates).toEqual(expect.arrayContaining(["tsp", "tbsp"]));
  });

  it("returns unknown (confidence 0) for nonsense, never throwing", () => {
    const r = normalizeUnit("zzzql");
    expect(r.unit).toBe("unknown");
    expect(r.confidence).toBe(0);
  });

  it("handles empty / whitespace input safely", () => {
    expect(normalizeUnit("").unit).toBe("unknown");
    expect(normalizeUnit("   ").unit).toBe("unknown");
  });
});

// ------------------------------------------------------------------
// AC2 — quantity parsing (§15, §43)
// ------------------------------------------------------------------
describe("parseQuantity", () => {
  it("parses whole numbers", () => {
    expect(parseQuantity("2")).toMatchObject({ value: 2, max: null, isRange: false });
  });
  it("parses decimals", () => {
    expect(parseQuantity("1.5")).toMatchObject({ value: 1.5, isRange: false });
  });
  it.each([
    ["½", 0.5],
    ["¼", 0.25],
    ["¾", 0.75],
    ["⅓", 1 / 3],
    ["⅔", 2 / 3],
    ["⅛", 0.125],
  ])("parses unicode fraction %s", (input, expected) => {
    expect(parseQuantity(input).value).toBeCloseTo(expected, 5);
  });
  it("parses typed fractions", () => {
    expect(parseQuantity("1/2").value).toBeCloseTo(0.5, 5);
    expect(parseQuantity("3/4").value).toBeCloseTo(0.75, 5);
  });
  it("parses mixed numbers (spaced and glued)", () => {
    expect(parseQuantity("1 1/2").value).toBeCloseTo(1.5, 5);
    expect(parseQuantity("1½").value).toBeCloseTo(1.5, 5);
    expect(parseQuantity("2 3/4").value).toBeCloseTo(2.75, 5);
  });
  it.each([
    ["2–3", 2, 3],
    ["2-3", 2, 3],
    ["2 to 3", 2, 3],
    ["200–250", 200, 250],
  ])("parses range %s", (input, lo, hi) => {
    const r = parseQuantity(input);
    expect(r.isRange).toBe(true);
    expect(r.value).toBe(lo);
    expect(r.max).toBe(hi);
  });
  it("captures modifiers without discarding the number", () => {
    expect(parseQuantity("about 2")).toMatchObject({ value: 2, modifiers: ["about"] });
    const heaped = parseQuantity("1 heaped teaspoon");
    expect(heaped.value).toBe(1);
    expect(heaped.modifiers).toContain("heaped");
  });
  it("treats a leading 'a'/'an' as one", () => {
    const r = parseQuantity("a heaped teaspoon");
    expect(r.value).toBe(1);
    expect(r.modifiers).toContain("heaped");
  });
  it("returns low confidence (no throw) for a value-less quantity", () => {
    const r = parseQuantity("to taste");
    expect(r.value).toBeNull();
    expect(r.confidence).toBeLessThan(0.5);
  });
  it("does not silently swap an inverted range", () => {
    const r = parseQuantity("5–3");
    expect(r.isRange).toBe(false);
    expect(r.confidence).toBeLessThan(0.5);
  });
});

// ------------------------------------------------------------------
// AC3 — exact weight conversion (§6, §43)
// ------------------------------------------------------------------
describe("weight conversion", () => {
  it.each([
    [1000, "g", "kg", 1],
    [1, "kg", "g", 1000],
    [1, "oz", "g", 28.349523125],
    [1, "lb", "g", 453.59237],
    [16, "oz", "lb", 1],
  ])("%d %s → %s = %d", (q, from, to, expected) => {
    const r = convert({ quantity: q, fromUnit: from as never, toUnit: to as never });
    expect(r.convertedQuantity).toBeCloseTo(expected, 6);
    expect(r.convertedUnit).toBe(to);
    expect(r.confidence).toBe("exact");
    expect(r.approximate).toBe(false);
  });

  it("converts both ends of a range independently", () => {
    const r = convert({ quantity: 200, quantityMax: 250, fromUnit: "g", toUnit: "oz" });
    expect(r.convertedQuantity).toBeCloseTo(200 / 28.349523125, 5);
    expect(r.convertedQuantityMax).toBeCloseTo(250 / 28.349523125, 5);
  });
});

// ------------------------------------------------------------------
// AC4 — regional volume conversion (§7, §8, §43)
// ------------------------------------------------------------------
describe("regional volume conversion", () => {
  it.each([
    [1, "cup", "metric", 250],
    [1, "cup", "us", 236.5882365],
    [1, "fl_oz", "us", 29.5735295625],
    [1, "fl_oz", "uk_ie", 28.4130625],
    [1, "pint", "us", 473.176473],
    [1, "pint", "uk_ie", 568.26125],
    [1, "tbsp", "australia", 20],
  ])("%d %s (%s) → ml", (q, from, region, expected) => {
    const r = convert({ quantity: q, fromUnit: from as never, toUnit: "ml", sourceRegion: region as never });
    expect(r.convertedQuantity).toBeCloseTo(expected, 6);
  });

  it("gives a US cup and a metric cup different millilitre values", () => {
    const us = convert({ quantity: 1, fromUnit: "cup", toUnit: "ml", sourceRegion: "us" }).convertedQuantity!;
    const metric = convert({ quantity: 1, fromUnit: "cup", toUnit: "ml", sourceRegion: "metric" }).convertedQuantity!;
    expect(us).not.toBeCloseTo(metric, 1);
  });
});

// ------------------------------------------------------------------
// AC5 — temperature conversion (§10, §43)
// ------------------------------------------------------------------
describe("temperature conversion", () => {
  it("F → C", () => {
    expect(convert({ quantity: 32, fromUnit: "fahrenheit", toUnit: "celsius" }).convertedQuantity).toBeCloseTo(0, 6);
    expect(convert({ quantity: 212, fromUnit: "fahrenheit", toUnit: "celsius" }).convertedQuantity).toBeCloseTo(100, 6);
  });
  it("C → F (pre-display-rounding, exact 356)", () => {
    expect(convert({ quantity: 180, fromUnit: "celsius", toUnit: "fahrenheit" }).convertedQuantity).toBeCloseTo(356, 6);
  });
  it("gas mark → Celsius via lookup", () => {
    expect(convert({ quantity: 4, fromUnit: "gas_mark", toUnit: "celsius" }).convertedQuantity).toBe(180);
    expect(convert({ quantity: 6, fromUnit: "gas_mark", toUnit: "celsius" }).convertedQuantity).toBe(200);
  });
  it("Celsius → gas mark via nearest lookup", () => {
    expect(convert({ quantity: 180, fromUnit: "celsius", toUnit: "gas_mark" }).convertedQuantity).toBe(4);
  });
});

// ------------------------------------------------------------------
// AC6 — length / dimension conversion (§11, §43)
// ------------------------------------------------------------------
describe("length conversion", () => {
  it("inch → mm exact", () => {
    expect(convert({ quantity: 1, fromUnit: "inch", toUnit: "mm" }).convertedQuantity).toBeCloseTo(25.4, 6);
  });
  it("cm → inch raw value", () => {
    expect(convert({ quantity: 20, fromUnit: "cm", toUnit: "inch" }).convertedQuantity).toBeCloseTo(7.874, 3);
  });
  it("practical tin equivalents snap to whole inches", () => {
    expect(practicalTinInches(200)).toBe(8); // 20 cm
    expect(practicalTinInches(230)).toBe(9); // 23 cm
  });
  it("small thickness snaps to a friendly fraction", () => {
    const inches = convert({ quantity: 5, fromUnit: "mm", toUnit: "inch" }).convertedQuantity!;
    expect(formatQuantityValue(inches)).toBe("¼");
  });
});

// ------------------------------------------------------------------
// AC7 — dimension safety (§5, §19, §43)
// ------------------------------------------------------------------
describe("dimension safety", () => {
  it("refuses cross-dimension conversions", () => {
    const r = convert({ quantity: 1, fromUnit: "g", toUnit: "cm" });
    expect(r.error).toBe("INCOMPATIBLE_DIMENSIONS");
    expect(r.confidence).toBe("unavailable");
    expect(r.convertedQuantity).toBeUndefined();
  });
  it("refuses volume→weight without a density profile", () => {
    const r = convert({ quantity: 1, fromUnit: "cup", toUnit: "g" });
    expect(r.error).toBe("MISSING_INGREDIENT_PROFILE");
    expect(r.confidence).toBe("unavailable");
    expect(r.convertedQuantity).toBeUndefined();
  });
  it("rejects a negative quantity", () => {
    const r = convert({ quantity: -5, fromUnit: "g", toUnit: "kg" });
    expect(r.error).toBe("INVALID_QUANTITY");
  });
  it("returns UNSUPPORTED for informal units, preserving the original", () => {
    const r = convert({ quantity: 1, fromUnit: "handful", toUnit: "g" });
    expect(r.confidence).toBe("unavailable");
    expect(r.convertedQuantity).toBeUndefined();
  });
});

// ------------------------------------------------------------------
// AC8 — friendly formatting (§27, §28, §43)
// ------------------------------------------------------------------
describe("formatting", () => {
  it.each([
    [0.125, "⅛"],
    [0.25, "¼"],
    [1 / 3, "⅓"],
    [0.5, "½"],
    [2 / 3, "⅔"],
    [0.75, "¾"],
  ])("friendlyFraction(%d) = %s", (v, expected) => {
    expect(friendlyFraction(v)).toBe(expected);
  });
  it("formats mixed numbers", () => {
    expect(formatQuantityValue(1.5)).toBe("1½");
    expect(formatQuantityValue(2.25)).toBe("2¼");
    expect(formatQuantityValue(3)).toBe("3");
  });
  it("selects friendly mass units", () => {
    expect(selectFriendlyMass(3)).toMatchObject({ value: 3, unit: "g" });
    expect(selectFriendlyMass(1500)).toMatchObject({ value: 1.5, unit: "kg" });
  });
  it("selects friendly volume units", () => {
    expect(selectFriendlyVolume(237)).toMatchObject({ value: 237, unit: "ml" });
    expect(selectFriendlyVolume(1500)).toMatchObject({ value: 1.5, unit: "l" });
  });
  it("applies display-rounding bands", () => {
    expect(roundForDisplay(236.5882365, "volume")).toBe(235); // 100–1000 ml → nearest 5
    expect(roundForDisplay(125.4, "weight")).toBe(125); // 100–1000 g → nearest 5
  });
  it("never mutates source precision (repeated format is idempotent)", () => {
    const grams = 200 / 28.349523125 * 28.349523125; // round-trip
    expect(roundForDisplay(grams, "weight")).toBe(roundForDisplay(roundForDisplay(grams, "weight"), "weight"));
  });
});
