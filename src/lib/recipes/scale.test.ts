import { describe, it, expect } from "vitest";
import { parseServings, scaleIngredientText } from "@/lib/recipes/scale";

describe("parseServings", () => {
  it("pulls the first number out of free text", () => {
    expect(parseServings("2 large portions")).toBe(2);
    expect(parseServings("Serves 4")).toBe(4);
    expect(parseServings("2")).toBe(2);
  });
  it("returns null when there's nothing to scale from", () => {
    expect(parseServings("a few")).toBeNull();
    expect(parseServings(null)).toBeNull();
    expect(parseServings("")).toBeNull();
  });
});

describe("scaleIngredientText", () => {
  it("scales a leading integer and grams", () => {
    expect(scaleIngredientText("2 chicken breasts", 2)).toBe("4 chicken breasts");
    expect(scaleIngredientText("100g feta", 1.5)).toBe("150g feta");
  });

  it("scales fractions and renders them nicely", () => {
    expect(scaleIngredientText("1/2 cucumber", 2)).toBe("1 cucumber");
    expect(scaleIngredientText("1 lemon", 0.5)).toBe("½ lemon");
    expect(scaleIngredientText("½ onion", 2)).toBe("1 onion");
    expect(scaleIngredientText("3 apples", 0.5)).toBe("1½ apples");
  });

  it("scales only the lead number — 2 x 125g scales the count, not the weight", () => {
    expect(scaleIngredientText("2 x 125g chicken", 2)).toBe("4 x 125g chicken");
  });

  it("scales BOTH endpoints of a leading range", () => {
    expect(scaleIngredientText("1–2 tbsp oil", 2)).toBe("2–4 tbsp oil");
    expect(scaleIngredientText("1-2 tbsp oil", 2)).toBe("2-4 tbsp oil");
    expect(scaleIngredientText("1 to 2 cloves garlic", 2)).toBe("2 to 4 cloves garlic");
    expect(scaleIngredientText("200–250 g flour", 2)).toBe("400–500 g flour");
  });

  it("leaves numberless lines and factor-1 unchanged", () => {
    expect(scaleIngredientText("salt to taste", 3)).toBe("salt to taste");
    expect(scaleIngredientText("2 eggs", 1)).toBe("2 eggs");
  });
});
