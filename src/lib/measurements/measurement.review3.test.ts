/**
 * Review-response round 3 — pins the four findings from Codex's third pass on
 * PR #21 (reviewing b9f9e03), all in the "never emit a corrupt numeric result"
 * family: overflow, half-convertible ranges, inverted direct bounds, and
 * Unicode-punctuation normalisation.
 */

import { describe, it, expect } from "vitest";
import { normalizeUnit } from "./unit-normalizer";
import { convert } from "./measurement-converter";

describe("review3 · overflow is rejected, not returned as Infinity (P2)", () => {
  it("MAX_VALUE kg → g fails instead of returning Infinity as exact", () => {
    const r = convert({ quantity: Number.MAX_VALUE, fromUnit: "kg", toUnit: "g" });
    expect(r.error).toBe("UNSUPPORTED_CONVERSION");
    expect(r.convertedQuantity).toBeUndefined();
  });
});

describe("review3 · a half-convertible range fails whole (P2)", () => {
  it("Gas 4–4.5 → celsius is unavailable (upper bound not in table)", () => {
    const r = convert({ quantity: 4, quantityMax: 4.5, fromUnit: "gas_mark", toUnit: "celsius" });
    expect(r.error).toBe("UNSUPPORTED_CONVERSION");
    expect(r.convertedQuantity).toBeUndefined();
  });
  it("Gas 4–5 → celsius (both in table) still converts both ends", () => {
    const r = convert({ quantity: 4, quantityMax: 5, fromUnit: "gas_mark", toUnit: "celsius" });
    expect(r.convertedQuantity).toBe(180);
    expect(r.convertedQuantityMax).toBe(190);
  });
});

describe("review3 · inverted bounds passed directly are rejected (P2)", () => {
  it("{quantity:250, quantityMax:200} fails rather than returning an inverted range", () => {
    const r = convert({ quantity: 250, quantityMax: 200, fromUnit: "g", toUnit: "oz" });
    expect(r.error).toBe("INVALID_QUANTITY");
  });
  it("a correctly-ordered range still converts", () => {
    const r = convert({ quantity: 200, quantityMax: 250, fromUnit: "g", toUnit: "oz" });
    expect(r.convertedQuantity).toBeCloseTo(200 / 28.349523125, 5);
    expect(r.convertedQuantityMax).toBeCloseTo(250 / 28.349523125, 5);
  });
});

describe("review3 · Unicode punctuation in units normalises (P2)", () => {
  it("non-breaking hyphen fl‑oz → fl_oz", () => {
    expect(normalizeUnit("fl‑oz").unit).toBe("fl_oz");
  });
  it("ASCII fl-oz → fl_oz", () => {
    expect(normalizeUnit("fl-oz").unit).toBe("fl_oz");
  });
  it("fullwidth stop tbsp． → tbsp", () => {
    expect(normalizeUnit("tbsp．").unit).toBe("tbsp");
  });
  it("still resolves the plain ASCII forms", () => {
    expect(normalizeUnit("fl oz").unit).toBe("fl_oz");
    expect(normalizeUnit("tbsp.").unit).toBe("tbsp");
  });
});
