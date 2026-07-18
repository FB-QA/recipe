import { describe, expect, it } from "vitest";
import { resolveGroups, flattenIngredients } from "./groups";
import type { IngredientInput } from "./schema";

const ing = (over: Partial<IngredientInput> & { display_text: string }): IngredientInput => ({
  quantity: null, unit: null, name: null, quantity_value: null, quantity_min: null,
  quantity_max: null, preparation: null, optional: false, alternative_group: null, ...over,
});

describe("resolveGroups", () => {
  it("keeps structured sections verbatim, in order", () => {
    const groups = resolveGroups({
      ingredients: [],
      ingredientGroups: [
        { name: "For the ragu", optional: false, ingredients: [ing({ display_text: "500g mince" })] },
        { name: "For the béchamel", optional: false, ingredients: [ing({ display_text: "50g butter" })] },
      ],
    });
    expect(groups.map((g) => g.name)).toEqual(["For the ragu", "For the béchamel"]);
  });

  it("collapses a flat manual recipe to one unnamed group", () => {
    const groups = resolveGroups({ ingredients: [ing({ display_text: "2 eggs" }), ing({ display_text: "flour" })] });
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBeNull();
    expect(groups[0].ingredients).toHaveLength(2);
  });

  it("drops empty sections and empty ingredient lines, never inventing", () => {
    const groups = resolveGroups({
      ingredients: [],
      ingredientGroups: [
        { name: "Real", optional: false, ingredients: [ing({ display_text: "sugar" }), ing({ display_text: "  " })] },
        { name: "Empty", optional: false, ingredients: [ing({ display_text: "   " })] },
      ],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Real");
    expect(groups[0].ingredients).toHaveLength(1);
  });
});

describe("flattenIngredients — global ordering + group tagging", () => {
  it("assigns a continuous sort_order across groups and tags each row's group", () => {
    const rows = flattenIngredients(
      resolveGroups({
        ingredients: [],
        ingredientGroups: [
          { name: "A", optional: false, ingredients: [ing({ display_text: "a1" }), ing({ display_text: "a2" })] },
          { name: "B", optional: false, ingredients: [ing({ display_text: "b1" })] },
        ],
      }),
    );
    expect(rows.map((r) => [r.groupIndex, r.sort_order, r.display_text])).toEqual([
      [0, 0, "a1"],
      [0, 1, "a2"],
      [1, 2, "b1"],
    ]);
  });

  it("carries structured fields (range, optional, alternative) through", () => {
    const rows = flattenIngredients(
      resolveGroups({
        ingredients: [],
        ingredientGroups: [{ name: null, optional: false, ingredients: [
          ing({ display_text: "1–2 tbsp oil", quantity_min: 1, quantity_max: 2, unit: "tbsp" }),
          ing({ display_text: "pecans", optional: true, alternative_group: "alt1" }),
        ] }],
      }),
    );
    expect(rows[0].quantity_min).toBe(1);
    expect(rows[0].quantity_max).toBe(2);
    expect(rows[1].optional).toBe(true);
    expect(rows[1].alternative_group).toBe("alt1");
  });
});
