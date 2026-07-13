import { describe, it, expect } from "vitest";
import { recipeToText } from "@/lib/recipes/share";

describe("recipeToText", () => {
  it("formats a recipe as plain text with sections", () => {
    const text = recipeToText({
      title: "Greek Salad",
      servings: "2",
      prep_time: "10 min",
      cook_time: null,
      ingredients: [
        { display_text: "1 cucumber", quantity: null, unit: null, name: null },
        { display_text: "100g feta", quantity: null, unit: null, name: null },
      ],
      steps: [{ instruction: "Chop everything." }, { instruction: "Dress and serve." }],
      tips: [{ text: "Best fresh." }],
      source_url: "https://example.com/greek-salad",
    });

    expect(text).toContain("Greek Salad");
    expect(text).toContain("Serves 2 · Prep 10 min");
    expect(text).toContain("- 1 cucumber");
    expect(text).toContain("1. Chop everything.");
    expect(text).toContain("2. Dress and serve.");
    expect(text).toContain("- Best fresh.");
    expect(text).toContain("Source: https://example.com/greek-salad");
  });

  it("omits empty sections", () => {
    const text = recipeToText({
      title: "Toast",
      servings: null,
      prep_time: null,
      cook_time: null,
      ingredients: [],
      steps: [],
      tips: [],
      source_url: null,
    });
    expect(text).toBe("Toast");
  });
});
