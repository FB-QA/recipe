import { describe, expect, it } from "vitest";
import { extractedToFormInitial, minutesToLabel } from "./to-form";
import type { ExtractedRecipe } from "./schema";

const recipe: ExtractedRecipe = {
  extractionStatus: "recipe",
  title: "One-Pan Orzo",
  description: "Weeknight dinner",
  servings: { value: 4, originalText: "Serves 4" },
  prepTimeMinutes: 10,
  cookTimeMinutes: 90,
  totalTimeMinutes: null,
  ingredientGroups: [
    { temporaryId: "g0", name: "For the base", position: 0, optional: false, ingredients: [
      { temporaryId: "i0", position: 0, originalText: "1–2 tbsp olive oil", quantityText: "1–2 tbsp", quantityValue: null, quantityMin: 1, quantityMax: 2, unit: "tbsp", name: "olive oil", preparation: null, optional: false, alternativeGroupId: null },
    ] },
    { temporaryId: "g1", name: "To finish", position: 1, optional: false, ingredients: [
      { temporaryId: "i1", position: 0, originalText: "15–20g toasted pecans", quantityText: "15–20g", quantityValue: null, quantityMin: 15, quantityMax: 20, unit: "g", name: "pecans", preparation: "toasted", optional: true, alternativeGroupId: null },
    ] },
  ],
  steps: [
    { position: 0, title: "Roast", instruction: "Roast the strawberries.", ingredientGroupReferences: [] },
    { position: 1, title: null, instruction: "Combine and chill.", ingredientGroupReferences: [] },
  ],
  tips: ["Best next day."],
  servingSuggestions: [],
  source: { sourceType: "website", sourceUrl: "https://x.test/orzo", sourceTitle: null, creatorName: null, retrievalMethod: "jsonld" },
  warnings: [],
  missingFields: [],
};

describe("minutesToLabel", () => {
  it("formats hours and minutes", () => {
    expect(minutesToLabel(90)).toBe("1 hr 30 min");
    expect(minutesToLabel(20)).toBe("20 min");
    expect(minutesToLabel(60)).toBe("1 hr");
    expect(minutesToLabel(null)).toBe("");
    expect(minutesToLabel(0)).toBe("");
  });
});

describe("extractedToFormInitial — display-only flattening (groups persist next story)", () => {
  it("preserves verbatim ingredient wording across all groups, including ranges", () => {
    const form = extractedToFormInitial(recipe);
    expect(form.ingredients).toEqual(["1–2 tbsp olive oil", "15–20g toasted pecans"]);
  });

  it("keeps step titles inline and the source URL from the recipe", () => {
    const form = extractedToFormInitial(recipe);
    expect(form.steps).toEqual(["Roast: Roast the strawberries.", "Combine and chill."]);
    expect(form.source_url).toBe("https://x.test/orzo");
    expect(form.prep_time).toBe("10 min");
    expect(form.cook_time).toBe("1 hr 30 min");
    expect(form.servings).toBe("Serves 4");
  });

  it("falls back to a safe title and empty lists rather than crashing on a sparse recipe", () => {
    const sparse: ExtractedRecipe = { ...recipe, title: null, ingredientGroups: [], steps: [], tips: [] };
    const form = extractedToFormInitial(sparse);
    expect(form.title).toBe("Untitled recipe");
    expect(form.ingredients).toEqual([""]);
    expect(form.steps).toEqual([""]);
  });
});
