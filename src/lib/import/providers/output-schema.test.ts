import { describe, expect, it } from "vitest";
import { OUTPUT_SCHEMA } from "./anthropic";
import { normaliseRecipe } from "../validate";
import type { AiExtractedRecipe } from "../schema";

/**
 * Anthropic's structured-output compiler rejects any schema with more than 16
 * union-typed parameters (`type: [x, "null"]` or `anyOf`) with a 400 — which the
 * import pipeline mislabels as "extraction service is busy". This guard keeps the
 * extraction schema under that ceiling so the whole class of failure cannot recur.
 */
const ANTHROPIC_UNION_LIMIT = 16;

function countUnionParams(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  const schema = node as Record<string, unknown>;
  let count = 0;
  if (Array.isArray(schema.type) || Array.isArray(schema.anyOf)) count += 1;
  if (schema.properties && typeof schema.properties === "object") {
    for (const child of Object.values(schema.properties as Record<string, unknown>)) {
      count += countUnionParams(child);
    }
  }
  if (schema.items) count += countUnionParams(schema.items);
  return count;
}

describe("OUTPUT_SCHEMA — Anthropic union-parameter ceiling", () => {
  it("stays within Anthropic's 16 union-typed-parameter limit", () => {
    expect(countUnionParams(OUTPUT_SCHEMA)).toBeLessThanOrEqual(ANTHROPIC_UNION_LIMIT);
  });
});

describe("empty-string sentinels normalise identically to null", () => {
  // The schema forbids null for text fields (to stay under the union ceiling), so
  // the model emits "" where it used to emit null. normaliseRecipe must fold those
  // blanks to null so nothing downstream can tell the difference.
  function recipe(overrides: Partial<AiExtractedRecipe>): AiExtractedRecipe {
    return {
      extractionStatus: "recipe",
      title: "Toast",
      description: null,
      servings: { value: null, originalText: null },
      nutrition: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
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
              originalText: "1 slice bread",
              quantityText: null,
              quantityValue: null,
              quantityMin: null,
              quantityMax: null,
              unit: null,
              name: "bread",
              preparation: null,
              optional: false,
              alternativeGroupId: null,
            },
          ],
        },
      ],
      steps: [{ position: 0, title: null, instruction: "Toast it.", ingredientGroupReferences: [] }],
      tips: [],
      servingSuggestions: [],
      warnings: [],
      missingFields: [],
      ...overrides,
    } as AiExtractedRecipe;
  }

  it("blank text fields become null, matching a null-valued extraction", () => {
    const withBlanks = recipe({
      description: "",
      servings: { value: null, originalText: "" },
      ingredientGroups: [
        {
          temporaryId: "g1",
          name: "",
          position: 0,
          optional: false,
          ingredients: [
            {
              temporaryId: "i1",
              position: 0,
              originalText: "1 slice bread",
              quantityText: "",
              quantityValue: null,
              quantityMin: null,
              quantityMax: null,
              unit: "",
              name: "bread",
              preparation: "",
              optional: false,
              alternativeGroupId: "",
            },
          ],
        },
      ],
      steps: [{ position: 0, title: "", instruction: "Toast it.", ingredientGroupReferences: [] }],
    } as Partial<AiExtractedRecipe>);

    const normalised = normaliseRecipe(withBlanks);
    expect(normalised.description).toBeNull();
    expect(normalised.servings.originalText).toBeNull();
    expect(normalised.ingredientGroups[0].name).toBeNull();
    const ing = normalised.ingredientGroups[0].ingredients[0];
    expect(ing.quantityText).toBeNull();
    expect(ing.unit).toBeNull();
    expect(ing.preparation).toBeNull();
    expect(ing.alternativeGroupId).toBeNull();
    expect(normalised.steps[0].title).toBeNull();
  });

  it("blank nutrition object collapses to null like an omitted block", () => {
    const withEmptyNutrition = recipe({
      nutrition: {
        calories: "",
        protein: "",
        carbs: "",
        fat: "",
        fibre: "",
        sugar: "",
        perServing: null,
      },
    });
    expect(normaliseRecipe(withEmptyNutrition).nutrition).toBeNull();
  });
});
