import { describe, expect, it } from "vitest";
import { normaliseRecipe, minimumUsable, qualityScore } from "./validate";
import type { AiExtractedRecipe } from "./schema";

function recipe(overrides: Partial<AiExtractedRecipe> = {}): AiExtractedRecipe {
  return {
    extractionStatus: "recipe",
    title: "Chicken orzo",
    description: null,
    servings: { value: 4, originalText: "Serves 4" },
    nutrition: null,
    prepTimeMinutes: 10,
    cookTimeMinutes: 25,
    totalTimeMinutes: null,
    ingredientGroups: [
      {
        temporaryId: "g1",
        name: null,
        position: 0,
        optional: false,
        ingredients: [
          {
            temporaryId: "i1",
            position: 0,
            originalText: "1–2 tbsp olive oil",
            quantityText: "1–2 tbsp",
            quantityValue: null,
            quantityMin: 1,
            quantityMax: 2,
            unit: "tbsp",
            name: "olive oil",
            preparation: null,
            optional: false,
            alternativeGroupId: null,
          },
          {
            temporaryId: "i2",
            position: 1,
            originalText: "500g chicken thighs",
            quantityText: "500g",
            quantityValue: 500,
            quantityMin: null,
            quantityMax: null,
            unit: "g",
            name: "chicken thighs",
            preparation: null,
            optional: false,
            alternativeGroupId: null,
          },
        ],
      },
    ],
    steps: [
      { position: 0, title: null, instruction: "Brown the chicken.", ingredientGroupReferences: [] },
      { position: 1, title: null, instruction: "Add orzo and simmer.", ingredientGroupReferences: [] },
    ],
    tips: [],
    servingSuggestions: [],
    warnings: [],
    missingFields: [],
    ...overrides,
  };
}

describe("normaliseRecipe — §19", () => {
  it("preserves quantity ranges — '1–2 tbsp' is never collapsed (AC2/AC5)", () => {
    const n = normaliseRecipe(recipe());
    const oil = n.ingredientGroups[0].ingredients[0];
    expect(oil.quantityMin).toBe(1);
    expect(oil.quantityMax).toBe(2);
    expect(oil.originalText).toBe("1–2 tbsp olive oil");
  });

  it("turns empty strings into nulls and drops empty groups/ingredients/steps", () => {
    const messy = recipe();
    messy.title = "  ";
    messy.ingredientGroups.push({
      temporaryId: "g2",
      name: "",
      position: 1,
      optional: false,
      ingredients: [],
    });
    messy.steps.push({ position: 2, title: "", instruction: "   ", ingredientGroupReferences: [] });
    const n = normaliseRecipe(messy);
    expect(n.title).toBeNull();
    expect(n.ingredientGroups).toHaveLength(1);
    expect(n.steps).toHaveLength(2);
  });

  it("repairs inverted ranges and half-ranges rather than inventing values", () => {
    const bad = recipe();
    bad.ingredientGroups[0].ingredients[0].quantityMin = 5;
    bad.ingredientGroups[0].ingredients[0].quantityMax = 2;
    bad.ingredientGroups[0].ingredients[1].quantityMin = 3; // half range: max missing
    const n = normaliseRecipe(bad);
    const [a, b] = n.ingredientGroups[0].ingredients;
    expect(a.quantityMin).toBe(2);
    expect(a.quantityMax).toBe(5);
    expect(b.quantityMin).toBeNull();
    expect(b.quantityMax).toBeNull();
  });

  it("drops exact duplicate ingredients and re-sequences positions", () => {
    const dup = recipe();
    dup.ingredientGroups[0].ingredients.push({
      ...dup.ingredientGroups[0].ingredients[1],
      temporaryId: "i3",
      position: 7,
    });
    const n = normaliseRecipe(dup);
    expect(n.ingredientGroups[0].ingredients).toHaveLength(2);
    expect(n.ingredientGroups[0].ingredients.map((i) => i.position)).toEqual([0, 1]);
  });

  it("clears alternative groups with fewer than two members", () => {
    const solo = recipe();
    solo.ingredientGroups[0].ingredients[0].alternativeGroupId = "alt-1";
    const n = normaliseRecipe(solo);
    expect(n.ingredientGroups[0].ingredients[0].alternativeGroupId).toBeNull();
  });

  it("keeps genuine alternatives sharing an alternativeGroupId", () => {
    const alt = recipe();
    alt.ingredientGroups[0].ingredients[0].alternativeGroupId = "alt-1";
    alt.ingredientGroups[0].ingredients[1].alternativeGroupId = "alt-1";
    const n = normaliseRecipe(alt);
    expect(n.ingredientGroups[0].ingredients.map((i) => i.alternativeGroupId)).toEqual(["alt-1", "alt-1"]);
  });

  it("strips meaningless step titles like 'Step 1' (§18)", () => {
    const titled = recipe();
    titled.steps[0].title = "Step 1";
    titled.steps[1].title = "Make the sauce";
    const n = normaliseRecipe(titled);
    expect(n.steps[0].title).toBeNull();
    expect(n.steps[1].title).toBe("Make the sauce");
  });

  it("rejects negative times as absent rather than inventing", () => {
    const neg = recipe({ prepTimeMinutes: -5 });
    expect(normaliseRecipe(neg).prepTimeMinutes).toBeNull();
  });
});

describe("minimumUsable — §19 minimum usable recipe", () => {
  it("accepts the happy case", () => {
    expect(minimumUsable(normaliseRecipe(recipe()))).toBe(true);
  });

  it("refuses not_recipe / insufficient_content statuses", () => {
    expect(minimumUsable(normaliseRecipe(recipe({ extractionStatus: "not_recipe" })))).toBe(false);
    expect(minimumUsable(normaliseRecipe(recipe({ extractionStatus: "insufficient_content" })))).toBe(false);
  });

  it("refuses a recipe without title, ingredients, or steps", () => {
    expect(minimumUsable(normaliseRecipe(recipe({ title: "" })))).toBe(false);
    expect(minimumUsable(normaliseRecipe(recipe({ ingredientGroups: [] })))).toBe(false);
    expect(minimumUsable(normaliseRecipe(recipe({ steps: [] })))).toBe(false);
  });

  it("accepts-with-warnings when servings/times/description are missing", () => {
    const sparse = normaliseRecipe(
      recipe({
        servings: { value: null, originalText: null },
        nutrition: null,
        prepTimeMinutes: null,
        cookTimeMinutes: null,
      }),
    );
    expect(minimumUsable(sparse)).toBe(true);
  });
});

describe("qualityScore", () => {
  it("stays within 0–100 and rewards completeness", () => {
    const full = qualityScore(normaliseRecipe(recipe()));
    const sparse = qualityScore(
      normaliseRecipe(
        recipe({
          servings: { value: null, originalText: null },
          nutrition: null,
          prepTimeMinutes: null,
          cookTimeMinutes: null,
          description: null,
        }),
      ),
    );
    expect(full).toBeGreaterThan(sparse);
    expect(full).toBeLessThanOrEqual(100);
    expect(sparse).toBeGreaterThanOrEqual(0);
  });
});

describe("normaliseRecipe — nutrition", () => {
  it("passes stated nutrition through, blank amounts → null", () => {
    const r = normaliseRecipe(recipe({ nutrition: { calories: "480 kcal", protein: "45g", carbs: "  ", fat: "", fibre: "10g", sugar: null, perServing: true } }));
    expect(r.nutrition).toEqual({ calories: "480 kcal", protein: "45g", carbs: null, fat: null, fibre: "10g", sugar: null, perServing: true });
  });

  it("drops the nutrition block entirely when every macro is empty", () => {
    const r = normaliseRecipe(recipe({ nutrition: { calories: "", protein: null, carbs: "", fat: null, fibre: "", sugar: null, perServing: null } }));
    expect(r.nutrition).toBeNull();
  });
});
