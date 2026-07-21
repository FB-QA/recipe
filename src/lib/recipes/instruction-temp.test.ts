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

  it("collapses a dual-scale temperature instead of contradicting it", () => {
    expect(convertInstructionTemps("Bake at 180°C (350°F).", "metric")).toBe("Bake at 180°C.");
    expect(convertInstructionTemps("Bake at 180°C (350°F).", "us")).toBe("Bake at 350°F.");
    expect(convertInstructionTemps("Bake at 350°F (180°C).", "metric")).toBe("Bake at 180°C.");
  });

  it("does not partially convert an off-table decimal or range gas mark", () => {
    expect(convertInstructionTemps("Gas Mark 4.5 for an hour.", "metric")).toBe("Gas Mark 4.5 for an hour.");
    expect(convertInstructionTemps("Gas Mark 4–5.", "metric")).toBe("Gas Mark 4–5.");
  });

  it("still converts a valid gas mark ending a sentence", () => {
    expect(convertInstructionTemps("Set to Gas Mark 4.", "metric")).toBe("Set to 180°C.");
  });
});
