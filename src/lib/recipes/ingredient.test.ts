import { describe, expect, it } from "vitest";
import { groceryName, groceryQuantity, quantityLabel, ingredientLine } from "./ingredient";

describe("groceryName — measures dropped, counts kept", () => {
  const cases: Array<[string, string]> = [
    // Cooking measures dropped — you don't shop by the teaspoon.
    ["1 tbsp olive oil", "olive oil"],
    ["Tsp salt", "salt"],
    ["½ tsp chilli flakes (optional)", "chilli flakes"],
    ["2 tbsp chopped parsley", "chopped parsley"],
    ["1 tsp garlic powder", "garlic powder"],
    ["2 cloves garlic", "garlic"],
    ["200g chicken thighs", "chicken thighs"],
    ["1-2 tbsp oil", "oil"],
    // Bare counts kept — the number is what you're buying.
    ["3 lemons", "3 lemons"],
    ["2 eggs", "2 eggs"],
    ["1 onion", "1 onion"],
    ["salt", "salt"],
  ];
  for (const [input, expected] of cases) {
    it(`"${input}" → "${expected}"`, () => {
      // The extractor usually leaves the whole line in `name`; derive from that.
      expect(groceryName({ display_text: input, name: input })).toBe(expected);
    });
  }

  it("prefers the name field, falling back to display_text", () => {
    expect(groceryName({ display_text: "1 tbsp olive oil", name: "olive oil" })).toBe("olive oil");
    expect(groceryName({ display_text: "1 tbsp olive oil", name: null })).toBe("olive oil");
  });

  it("never returns empty even for a measurement-only string", () => {
    expect(groceryName({ display_text: "1 tbsp", name: "1 tbsp" })).not.toBe("");
  });
});

describe("groceryQuantity — structured count, measures dropped", () => {
  it("keeps a bare count (no unit)", () => {
    expect(groceryQuantity({ quantity: "3", unit: null })).toBe("3");
  });
  it("keeps a countable unit like a can", () => {
    expect(groceryQuantity({ quantity: "2", unit: "can" })).toBe("2 can");
  });
  it("drops a cooking measure", () => {
    expect(groceryQuantity({ quantity: "1", unit: "tbsp" })).toBeNull();
    expect(groceryQuantity({ quantity: "200", unit: "g" })).toBeNull();
  });
  it("returns null when unstructured (count lives inline in the name)", () => {
    expect(groceryQuantity({ quantity: null, unit: null })).toBeNull();
  });
});

describe("quantityLabel / ingredientLine (unchanged)", () => {
  it("joins quantity and unit", () => {
    expect(quantityLabel({ quantity: "1", unit: "tbsp" })).toBe("1 tbsp");
    expect(quantityLabel({ quantity: null, unit: null })).toBeNull();
  });
  it("reconstructs the line from parts", () => {
    expect(ingredientLine({ display_text: "x", quantity: "1", unit: "tbsp", name: "oil" })).toBe("1 tbsp oil");
  });
});
