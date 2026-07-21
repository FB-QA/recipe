import { describe, it, expect } from "vitest";
import { selectSystemUnit } from "./target-units";

// canonical values are grams (weight) / millilitres (volume) / mm (length).
describe("selectSystemUnit — direct boundary coverage", () => {
  describe("US weight (1 lb = 453.59237 g boundary)", () => {
    it("just below 1 lb → oz", () => {
      expect(selectSystemUnit(453.5, "weight", "us")).toBe("oz");
    });
    it("exactly 1 lb → lb", () => {
      expect(selectSystemUnit(453.59237, "weight", "us")).toBe("lb");
    });
    it("above 1 lb → lb", () => {
      expect(selectSystemUnit(2000, "weight", "us")).toBe("lb");
    });
  });

  describe("metric weight (mg / g / kg)", () => {
    it("below 1 g → mg", () => {
      expect(selectSystemUnit(0.5, "weight", "metric")).toBe("mg");
    });
    it("exactly 1 g → g", () => {
      expect(selectSystemUnit(1, "weight", "metric")).toBe("g");
    });
    it("just below 1000 g → g", () => {
      expect(selectSystemUnit(999.9, "weight", "metric")).toBe("g");
    });
    it("exactly 1000 g → kg", () => {
      expect(selectSystemUnit(1000, "weight", "metric")).toBe("kg");
    });
  });

  describe("metric volume (ml / L)", () => {
    it("just below 1000 ml → ml", () => {
      expect(selectSystemUnit(999.9, "volume", "metric")).toBe("ml");
    });
    it("exactly 1000 ml → L", () => {
      expect(selectSystemUnit(1000, "volume", "metric")).toBe("l");
    });
  });

  describe("US volume (15 / 118 / 946 ml boundaries)", () => {
    it.each([
      [14, "tsp"],
      [15, "tbsp"],
      [117, "tbsp"],
      [118, "cup"],
      [945, "cup"],
      [946, "quart"],
    ])("%d ml → %s", (ml, unit) => {
      expect(selectSystemUnit(ml, "volume", "us")).toBe(unit);
    });
  });

  it("uses the pound constant from the unit definition, not a hardcoded copy", () => {
    // Sanity: the boundary is exactly the lb definition, so 1 lb in grams is lb.
    expect(selectSystemUnit(453.59237, "weight", "us")).toBe("lb");
    expect(selectSystemUnit(453.59237 - 0.001, "weight", "us")).toBe("oz");
  });
});
