import { describe, it, expect } from "vitest";
import { convertInstructionTemps } from "./instruction-temp";

describe("convertInstructionTemps", () => {
  it("Fahrenheit → Celsius (metric), nearest 5°", () => {
    expect(convertInstructionTemps("Bake at 350°F for 20 min.", "metric")).toBe("Bake at 175°C for 20 min.");
  });

  it("Celsius → Fahrenheit (US), nearest 25° oven dial (180°C → 350°F)", () => {
    expect(convertInstructionTemps("Preheat to 180°C.", "us")).toBe("Preheat to 350°F.");
    expect(convertInstructionTemps("Roast at 200°C.", "us")).toBe("Roast at 400°F.");
  });

  it("Gas mark → Celsius / Fahrenheit via the table", () => {
    expect(convertInstructionTemps("Set oven to Gas Mark 4.", "metric")).toBe("Set oven to 180°C.");
    expect(convertInstructionTemps("Set oven to Gas Mark 4.", "us")).toBe("Set oven to 350°F.");
    expect(convertInstructionTemps("Gas Mark ½ overnight.", "metric")).toBe("120°C overnight.");
  });

  it("leaves a temperature already in the target scale untouched", () => {
    expect(convertInstructionTemps("Bake at 180°C.", "uk_ie")).toBe("Bake at 180°C.");
    expect(convertInstructionTemps("Bake at 350°F.", "us")).toBe("Bake at 350°F.");
  });

  it("leaves text with no temperature untouched", () => {
    expect(convertInstructionTemps("Mix the dry ingredients.", "metric")).toBe("Mix the dry ingredients.");
  });

  it("handles multiple temperatures in one instruction", () => {
    expect(convertInstructionTemps("Sear at 450°F then reduce to 350°F.", "metric")).toBe(
      "Sear at 230°C then reduce to 175°C.",
    );
  });

  it("does not corrupt a gas mark it cannot resolve", () => {
    // No 'Gas Mark 10' in the table → left as written.
    expect(convertInstructionTemps("Gas Mark 10.", "metric")).toBe("Gas Mark 10.");
  });

  it("collapses a parenthesised dual-scale temperature instead of contradicting it", () => {
    expect(convertInstructionTemps("Bake at 180°C (350°F).", "metric")).toBe("Bake at 180°C.");
    expect(convertInstructionTemps("Bake at 180°C (350°F).", "us")).toBe("Bake at 350°F.");
    expect(convertInstructionTemps("Bake at 350°F (180°C).", "metric")).toBe("Bake at 180°C.");
  });

  it("collapses slash- and 'or'-separated equivalents the same way", () => {
    expect(convertInstructionTemps("Bake at 180°C / 350°F.", "metric")).toBe("Bake at 180°C.");
    expect(convertInstructionTemps("Oven 180°C/350°F.", "us")).toBe("Oven 350°F.");
    expect(convertInstructionTemps("Heat to 180°C or 350°F.", "us")).toBe("Heat to 350°F.");
  });

  it("does NOT collapse same-scale alternatives (two distinct settings)", () => {
    // "180°C or 200°C" are two settings, not equivalents — preserve both.
    expect(convertInstructionTemps("Bake at 180°C or 200°C.", "metric")).toBe("Bake at 180°C or 200°C.");
    expect(convertInstructionTemps("Bake at 180°C or 200°C.", "us")).toBe("Bake at 350°F or 400°F.");
  });

  it("does NOT collapse mismatched cross-scale values (neither disappears)", () => {
    // 180°C ≠ 450°F, so they are not equivalents — convert each independently.
    expect(convertInstructionTemps("Try 180°C or 450°F.", "us")).toBe("Try 350°F or 450°F.");
    expect(convertInstructionTemps("Try 180°C or 450°F.", "metric")).toBe("Try 180°C or 230°C.");
  });

  it("supports no-degree-symbol forms (350 F / 180 C / 180C)", () => {
    expect(convertInstructionTemps("Bake at 350 F.", "metric")).toBe("Bake at 175°C.");
    expect(convertInstructionTemps("Bake at 180 C.", "us")).toBe("Bake at 350°F.");
    expect(convertInstructionTemps("Bake at 180C.", "us")).toBe("Bake at 350°F.");
  });

  it("does not match a number that is not a temperature", () => {
    expect(convertInstructionTemps("Add 2 fresh eggs and 100 cloves.", "us")).toBe("Add 2 fresh eggs and 100 cloves.");
  });

  it("keeps the sign on a negative (freezer) temperature", () => {
    // -18°C → US: -0.4°F → nearest 25 → 0°F (NOT -75°F from dropping the sign).
    expect(convertInstructionTemps("Freeze at -18°C.", "us")).toBe("Freeze at 0°F.");
    expect(convertInstructionTemps("Chill to -40°C.", "us")).toBe("Chill to -40°F.");
  });

  it("does not partially convert an off-table decimal, range, or mixed-fraction gas mark", () => {
    expect(convertInstructionTemps("Gas Mark 4.5 for an hour.", "metric")).toBe("Gas Mark 4.5 for an hour.");
    expect(convertInstructionTemps("Gas Mark 4–5.", "metric")).toBe("Gas Mark 4–5.");
    expect(convertInstructionTemps("Gas Mark 4½.", "metric")).toBe("Gas Mark 4½."); // not "180°C½"
  });

  it("still converts a valid gas mark ending a sentence", () => {
    expect(convertInstructionTemps("Set to Gas Mark 4.", "metric")).toBe("Set to 180°C.");
  });

  it("converts BOTH endpoints of a temperature range (never a mixed scale)", () => {
    expect(convertInstructionTemps("Bake at 180–200°C.", "us")).toBe("Bake at 350–400°F.");
    // 350°F = 176.7°C → 175; 400°F = 204.4°C → 205 (nearest 5° is the accurate value).
    expect(convertInstructionTemps("Bake at 350–400°F.", "metric")).toBe("Bake at 175–205°C.");
  });

  it("leaves a range already in the target scale untouched", () => {
    expect(convertInstructionTemps("Bake at 180–200°C.", "metric")).toBe("Bake at 180–200°C.");
  });

  it("converts a word-separated 'to' range across both endpoints", () => {
    expect(convertInstructionTemps("Bake at 180 to 200°C.", "us")).toBe("Bake at 350 to 400°F.");
  });

  it("keeps the sign on the FIRST endpoint of a negative range", () => {
    // -20°C = -4°F, -10°C = 14°F. Must not strand a stray '-' → '-70–15°F'.
    expect(convertInstructionTemps("Freeze at -20–-10°C.", "us")).toBe("Freeze at -4–14°F.");
  });

  it("converts an explicit single-digit temperature (with a degree sign)", () => {
    expect(convertInstructionTemps("Chill the dough to 5°C.", "us")).toBe("Chill the dough to 41°F.");
  });

  it("does NOT read a bare single-digit 'c' (cups) as a temperature", () => {
    expect(convertInstructionTemps("Add 5 c flour.", "us")).toBe("Add 5 c flour.");
  });

  it("converts a written-out degree unit ('350 degrees Fahrenheit')", () => {
    expect(convertInstructionTemps("Bake at 350 degrees Fahrenheit.", "metric")).toBe("Bake at 175°C.");
  });

  it("does not oven-round a non-oven temperature (100°C is ~212°F, not 200°F)", () => {
    expect(convertInstructionTemps("Heat the water to 100°C.", "us")).toBe("Heat the water to 212°F.");
  });

  it("does not match the fractional tail of a decimal temperature", () => {
    // "37.50°C" must not convert its "50" → "37.120°F".
    expect(convertInstructionTemps("Heat to 37.50°C.", "us")).toBe("Heat to 37.50°C.");
  });

  it("does NOT collapse a dual a full dial step apart (keeps both)", () => {
    // 180°C ≈ 350°F, but 375°F is one dial step hotter — a different setting.
    expect(convertInstructionTemps("Bake at 180°C (375°F).", "us")).toBe("Bake at 350°F (375°F).");
  });

  it("collapses a gas-mark dual instead of contradicting it", () => {
    expect(convertInstructionTemps("Bake at Gas Mark 4 / 350°F.", "metric")).toBe("Bake at 180°C.");
    expect(convertInstructionTemps("Bake at Gas Mark 4 (350°F).", "us")).toBe("Bake at 350°F.");
  });

  it("leaves a spaced-fraction gas mark unchanged (no '180°C 1/2')", () => {
    expect(convertInstructionTemps("Bake at Gas Mark 4 1/2.", "metric")).toBe("Bake at Gas Mark 4 1/2.");
  });

  it("converts a four-digit temperature whole (no partial '000°F' match)", () => {
    // 1000°F = 537.8°C → 538. Must NOT match only "000°F" → a malformed "1-20°C".
    expect(convertInstructionTemps("Heat a pizza oven to 1000°F.", "metric")).toBe("Heat a pizza oven to 538°C.");
  });

  it("does NOT read a multi-digit bare 'c' (cups) as Celsius", () => {
    // "10 c flour" is 10 cups, not 10°C. Uppercase "180 C" is still Celsius.
    expect(convertInstructionTemps("Add 10 c flour.", "us")).toBe("Add 10 c flour.");
    expect(convertInstructionTemps("Bake at 180 C.", "us")).toBe("Bake at 350°F.");
  });

  it("does NOT collapse a gas-mark dual that is a mismatched setting", () => {
    // Gas Mark 4 ≈ 350°F, but 375°F is Gas Mark 5 — convert each independently.
    expect(convertInstructionTemps("Bake at Gas Mark 4 / 375°F.", "us")).toBe("Bake at 350°F / 375°F.");
    // A genuine equivalent still collapses.
    expect(convertInstructionTemps("Bake at Gas Mark 4 / 350°F.", "us")).toBe("Bake at 350°F.");
  });
});
