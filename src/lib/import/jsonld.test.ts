import { describe, it, expect } from "vitest";
import { extractRecipeFromHtml, durationToMinutes, jsonLdImageUrl } from "@/lib/import/jsonld";

const withJsonLd = (json: object) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(json)}</script></head><body></body></html>`;

const RECIPE = {
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Greek Chicken Burgers",
  description: "Juicy and quick.",
  recipeYield: "2 servings",
  prepTime: "PT10M",
  cookTime: "PT12M",
  recipeIngredient: ["2 chicken breasts", "100g feta"],
  recipeInstructions: [
    { "@type": "HowToStep", text: "Marinate the chicken." },
    { "@type": "HowToStep", text: "Griddle until charred." },
  ],
  image: "https://example.com/burger.jpg",
};

describe("durationToMinutes", () => {
  it("parses ISO durations to minutes", () => {
    expect(durationToMinutes("PT1H30M")).toBe(90);
    expect(durationToMinutes("PT20M")).toBe(20);
    expect(durationToMinutes("PT2H")).toBe(120);
  });
  it("returns null for unparseable input", () => {
    expect(durationToMinutes("")).toBeNull();
    expect(durationToMinutes("banana")).toBeNull();
    expect(durationToMinutes(null)).toBeNull();
  });
});

describe("extractRecipeFromHtml — v2 shape (AC1: complete structured data, zero AI)", () => {
  it("extracts a full recipe with a single unnamed group and verbatim ingredient text", () => {
    const r = extractRecipeFromHtml(withJsonLd(RECIPE));
    expect(r).not.toBeNull();
    expect(r!.extractionStatus).toBe("recipe");
    expect(r!.title).toBe("Greek Chicken Burgers");
    // Recipes without meaningful sections get one unnamed group (§18).
    expect(r!.ingredientGroups).toHaveLength(1);
    expect(r!.ingredientGroups[0].name).toBeNull();
    expect(r!.ingredientGroups[0].ingredients.map((i) => i.originalText)).toEqual([
      "2 chicken breasts",
      "100g feta",
    ]);
    expect(r!.steps.map((s) => s.instruction)).toEqual(["Marinate the chicken.", "Griddle until charred."]);
    expect(r!.servings.originalText).toBe("2 servings");
    expect(r!.servings.value).toBe(2);
    expect(r!.prepTimeMinutes).toBe(10);
    expect(r!.cookTimeMinutes).toBe(12);
  });

  it("finds a Recipe nested in an @graph", () => {
    const graph = { "@context": "https://schema.org", "@graph": [{ "@type": "WebPage" }, RECIPE] };
    expect(extractRecipeFromHtml(withJsonLd(graph))?.title).toBe("Greek Chicken Burgers");
  });

  it("splits newline-joined string instructions and keeps step order", () => {
    const r = extractRecipeFromHtml(
      withJsonLd({ ...RECIPE, recipeInstructions: "Step one.\nStep two.\nStep three." }),
    );
    expect(r!.steps.map((s) => s.instruction)).toEqual(["Step one.", "Step two.", "Step three."]);
    expect(r!.steps.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it("preserves HowToSection groupings as named step titles", () => {
    const r = extractRecipeFromHtml(
      withJsonLd({
        ...RECIPE,
        recipeInstructions: [
          {
            "@type": "HowToSection",
            name: "The sauce",
            itemListElement: [{ "@type": "HowToStep", text: "Whisk everything." }],
          },
        ],
      }),
    );
    expect(r!.steps).toHaveLength(1);
    expect(r!.steps[0].instruction).toBe("Whisk everything.");
  });

  it("extracts nutrition from schema.org NutritionInformation", () => {
    const r = extractRecipeFromHtml(withJsonLd({
      ...RECIPE,
      nutrition: { "@type": "NutritionInformation", calories: "480 kcal", proteinContent: "45g", carbohydrateContent: "30g", fiberContent: "8g", sugarContent: "12g" },
    }));
    expect(r!.nutrition).toEqual({ calories: "480 kcal", protein: "45g", carbs: "30g", fat: null, fibre: "8g", sugar: "12g", perServing: true });
  });

  it("does not blow the stack on a deeply nested @graph (recursion cap)", () => {
    let node: object = { "@type": "Recipe", name: "x", recipeIngredient: ["1 egg"], recipeInstructions: ["mix"] };
    for (let i = 0; i < 5000; i++) node = { "@graph": node };
    const html = withJsonLd(node);
    expect(() => extractRecipeFromHtml(html)).not.toThrow();
  });

  it("leaves nutrition null when the source omits it", () => {
    expect(extractRecipeFromHtml(withJsonLd(RECIPE))!.nutrition).toBeNull();
  });

  it("reads a numeric recipeYield (schema.org allows a bare number)", () => {
    const r = extractRecipeFromHtml(withJsonLd({ ...RECIPE, recipeYield: 4 }));
    expect(r!.servings.value).toBe(4);
    expect(r!.servings.originalText).toBe("4");
  });

  it("reads an array recipeYield", () => {
    const r = extractRecipeFromHtml(withJsonLd({ ...RECIPE, recipeYield: ["6", "6 servings"] }));
    expect(r!.servings.value).toBe(6);
  });

  it("leaves absent fields null rather than inventing (AC5)", () => {
    const sparse = { ...RECIPE, description: undefined, prepTime: undefined, recipeYield: undefined };
    const r = extractRecipeFromHtml(withJsonLd(sparse));
    expect(r!.description).toBeNull();
    expect(r!.prepTimeMinutes).toBeNull();
    expect(r!.servings.value).toBeNull();
  });

  it("returns null when there is no recipe or it lacks content", () => {
    expect(extractRecipeFromHtml("<html><body>nothing</body></html>")).toBeNull();
    expect(extractRecipeFromHtml(withJsonLd({ "@type": "Recipe", name: "Empty" }))).toBeNull();
  });
});

describe("jsonLdImageUrl", () => {
  it("pulls the recipe image for future cover use", () => {
    expect(jsonLdImageUrl(withJsonLd(RECIPE))).toBe("https://example.com/burger.jpg");
  });
});
