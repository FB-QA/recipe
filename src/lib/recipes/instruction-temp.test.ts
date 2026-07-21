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
});
