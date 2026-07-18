import { describe, expect, it } from "vitest";
import { groceryName, quantityLabel, ingredientLine } from "./ingredient";

describe("groceryName — the shopping item, measurement stripped", () => {
  const cases: Array<[string, string]> = [
    ["1 tbsp olive oil", "olive oil"],
    ["Tsp salt", "salt"],
    ["½ tsp chilli flakes (optional)", "chilli flakes"],
    ["2 tbsp chopped parsley", "chopped parsley"],
    ["1 tsp garlic powder", "garlic powder"],
    ["2 cloves garlic", "garlic"],
    ["200g chicken thighs", "chicken thighs"],
    ["1-2 tbsp oil", "oil"],
    ["2 eggs", "eggs"],
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

describe("quantityLabel / ingredientLine (unchanged)", () => {
  it("joins quantity and unit", () => {
    expect(quantityLabel({ quantity: "1", unit: "tbsp" })).toBe("1 tbsp");
    expect(quantityLabel({ quantity: null, unit: null })).toBeNull();
  });
  it("reconstructs the line from parts", () => {
    expect(ingredientLine({ display_text: "x", quantity: "1", unit: "tbsp", name: "oil" })).toBe("1 tbsp oil");
  });
});
