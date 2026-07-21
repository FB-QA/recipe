/**
 * Falsify pass — assume the green engine is lying. Black-box adversarial
 * probes, anchored to no acceptance criterion. Vectors committed up front:
 *   1. Malformed / non-finite / negative quantities
 *   2. Boundary & out-of-range lookups (gas mark, zero, huge values)
 *   3. Round-trip drift (convert there-and-back, and repeated formatting)
 *   4. Injection-ish / junk strings into the parsers
 *   5. Locale traps (comma decimals, mixed unicode ranges, casing)
 */

import { describe, it, expect } from "vitest";
import { normalizeUnit } from "./unit-normalizer";
import { parseQuantity } from "./quantity-parser";
import { convert } from "./measurement-converter";
import { formatQuantityValue, roundForDisplay } from "./quantity-formatter";

describe("falsify · malformed quantities", () => {
  it("rejects NaN and Infinity rather than emitting a bogus number", () => {
    expect(convert({ quantity: NaN, fromUnit: "g", toUnit: "kg" }).error).toBe("INVALID_QUANTITY");
    expect(convert({ quantity: Infinity, fromUnit: "g", toUnit: "kg" }).error).toBe("INVALID_QUANTITY");
  });
  it("accepts a legitimate zero (0 g is 0 kg, not an error)", () => {
    const r = convert({ quantity: 0, fromUnit: "g", toUnit: "kg" });
    expect(r.error).toBeUndefined();
    expect(r.convertedQuantity).toBe(0);
  });
  it("does not throw on a null-ish unit string", () => {
    expect(() => normalizeUnit(undefined as unknown as string)).not.toThrow();
    expect(normalizeUnit(undefined as unknown as string).unit).toBe("unknown");
  });
});

describe("falsify · boundary lookups", () => {
  it("refuses an out-of-table gas mark rather than snapping to a real setting", () => {
    const r = convert({ quantity: 11, fromUnit: "gas_mark", toUnit: "celsius" });
    expect(r.convertedQuantity).toBeUndefined();
    expect(r.confidence).toBe("unavailable");
  });
  it("survives an astronomically large weight without precision collapse", () => {
    const r = convert({ quantity: 1e9, fromUnit: "kg", toUnit: "g" });
    expect(r.convertedQuantity).toBe(1e12);
  });
});

describe("falsify · round-trip drift", () => {
  it("cup → ml → cup returns the original value (same region)", () => {
    const ml = convert({ quantity: 1, fromUnit: "cup", toUnit: "ml", sourceRegion: "us" }).convertedQuantity!;
    const back = convert({ quantity: ml, fromUnit: "ml", toUnit: "cup", sourceRegion: "us" }).convertedQuantity!;
    expect(back).toBeCloseTo(1, 10);
  });
  it("repeated display rounding never drifts", () => {
    const once = roundForDisplay(236.5882365, "volume");
    const twice = roundForDisplay(once, "volume");
    expect(twice).toBe(once);
  });
});

describe("falsify · junk into the parsers", () => {
  it("swallows an injection-ish string as an empty/unknown result, no throw", () => {
    expect(() => parseQuantity("<script>alert(1)</script>")).not.toThrow();
    expect(parseQuantity("<script>").value).toBeNull();
    expect(normalizeUnit("<script>").unit).toBe("unknown");
  });
  it("strips units and modifiers around a mixed number", () => {
    const r = parseQuantity("about 1 1/2 cups");
    expect(r.value).toBeCloseTo(1.5, 5);
    expect(r.modifiers).toContain("about");
  });
  it("formats a non-finite value to empty string, not 'NaN'", () => {
    expect(formatQuantityValue(NaN)).toBe("");
  });
});

describe("falsify · locale traps", () => {
  it("parses a unicode-fraction range", () => {
    const r = parseQuantity("1½–2½");
    expect(r.isRange).toBe(true);
    expect(r.value).toBeCloseTo(1.5, 5);
    expect(r.max).toBeCloseTo(2.5, 5);
  });
  it("does NOT guess a comma-decimal — safe low-confidence, never fabricated (documented limitation)", () => {
    // A European/Irish "1,5" is deliberately not interpreted as 1.5 here:
    // comma is ambiguous with a thousands separator, so we don't silently
    // guess (principle 5). Phase 4's parser hardening may revisit.
    const r = parseQuantity("1,5");
    expect(r.value).not.toBe(1.5);
    expect(r.confidence).toBeLessThan(0.5);
  });
  it("normalises casing and surrounding whitespace", () => {
    expect(normalizeUnit("  KG ").unit).toBe("kg");
    expect(normalizeUnit("Tablespoons").unit).toBe("tbsp");
  });
});
