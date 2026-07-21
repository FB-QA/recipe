/**
 * Review-response regressions — pins the fixes made in answer to the automated
 * PR review on #21 (Codex + Claude). Each test is the repro for one confirmed
 * finding; the two rejected findings are documented inline where they'd live.
 */

import { describe, it, expect } from "vitest";
import { normalizeUnit } from "./unit-normalizer";
import { parseQuantity, parseDimensions } from "./quantity-parser";
import { convert } from "./measurement-converter";

describe("review · compound quantities are not summed (Codex C2)", () => {
  it("does not fabricate 402 from '2 x 400g cans'", () => {
    const r = parseQuantity("2 x 400g cans");
    expect(r.value).not.toBe(402);
    expect(r.value).toBeNull();
    expect(r.confidence).toBeLessThan(0.5);
  });
  it("still parses a genuine mixed number", () => {
    expect(parseQuantity("1 1/2").value).toBeCloseTo(1.5, 5);
    expect(parseQuantity("2 3/4").value).toBeCloseTo(2.75, 5);
  });
});

describe("review · out-of-table gas marks are unavailable (Codex C1)", () => {
  it.each([11, 4.5, 0])("Gas %s → unavailable, not the nearest real setting", (gas) => {
    const r = convert({ quantity: gas, fromUnit: "gas_mark", toUnit: "celsius" });
    expect(r.convertedQuantity).toBeUndefined();
    expect(r.confidence).toBe("unavailable");
  });
  it("still converts a valid table gas mark", () => {
    expect(convert({ quantity: 4, fromUnit: "gas_mark", toUnit: "celsius" }).convertedQuantity).toBe(180);
  });
});

describe("review · bare f/F normalises to fahrenheit (Claude CL2)", () => {
  it.each(["f", "F"])("normalises %s", (input) => {
    expect(normalizeUnit(input).unit).toBe("fahrenheit");
  });
  it("leaves the genuinely ambiguous t and c ambiguous", () => {
    expect(normalizeUnit("t").ambiguous).toBe(true);
    expect(normalizeUnit("c").ambiguous).toBe(true);
  });
});

describe("review · targetSystem 'original' is a passthrough (Codex C6)", () => {
  it("returns the value unchanged, no error", () => {
    const r = convert({ quantity: 5, fromUnit: "cup", targetSystem: "original" });
    expect(r.error).toBeUndefined();
    expect(r.convertedQuantity).toBe(5);
    expect(r.convertedUnit).toBe("cup");
    expect(r.confidence).toBe("exact");
  });
});

describe("review · allowApproximate:false is honoured (Codex C3)", () => {
  it("refuses an approximate gas-mark target when approximate is disallowed", () => {
    const r = convert({ quantity: 160, fromUnit: "celsius", toUnit: "gas_mark", allowApproximate: false });
    expect(r.error).toBe("UNSUPPORTED_CONVERSION");
  });
  it("allows it by default", () => {
    const r = convert({ quantity: 160, fromUnit: "celsius", toUnit: "gas_mark" });
    expect(r.convertedQuantity).toBeDefined();
    expect(r.approximate).toBe(true);
  });
});

describe("review · multi-dimension tin parsing (Codex C4, AC6)", () => {
  it("parses a single dimension", () => {
    expect(parseDimensions("20 cm")).toEqual({ values: [20], unitText: "cm" });
    expect(parseDimensions("20cm")).toEqual({ values: [20], unitText: "cm" });
  });
  it("parses multi-dimension with × and x", () => {
    expect(parseDimensions("20 × 30 cm")).toEqual({ values: [20, 30], unitText: "cm" });
    expect(parseDimensions("8 x 12 inches")).toEqual({ values: [8, 12], unitText: "inches" });
  });
  it("each parsed dimension converts through the scalar converter", () => {
    const { values, unitText } = parseDimensions("20 × 30 cm");
    const unit = normalizeUnit(unitText!).unit;
    const converted = values.map((v) => convert({ quantity: v, fromUnit: unit, toUnit: "mm" }).convertedQuantity);
    expect(converted).toEqual([200, 300]);
  });
});

// Rejected findings (documented, no code change):
//  • Codex C5 "negative sign preserved" — parseQuantity("-5") already returns
//    value:null (verified), i.e. it does NOT fabricate 5. False positive.
//  • Claude CL3 "friendlyFraction tolerance" — no absolute tolerance separates
//    the spec's wanted 5mm→¼ (gap 0.053) from the unwanted 50ml-in-cups→¼
//    (gap 0.039); the closer value is the one to reject. It's a display-context
//    problem (don't render small volumes as cup-fractions) for Phase 2, not a
//    primitive-tolerance bug.
