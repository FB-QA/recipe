import { describe, it, expect } from "vitest";
import { extractRecipeFromHtml, humaniseDuration } from "@/lib/import/jsonld";

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

describe("humaniseDuration", () => {
  it("formats hours and minutes", () => {
    expect(humaniseDuration("PT1H30M")).toBe("1 hr 30 min");
    expect(humaniseDuration("PT20M")).toBe("20 min");
    expect(humaniseDuration("PT2H")).toBe("2 hr");
  });
  it("returns null for unparseable input", () => {
    expect(humaniseDuration("")).toBeNull();
    expect(humaniseDuration("banana")).toBeNull();
    expect(humaniseDuration(null)).toBeNull();
  });
});

describe("extractRecipeFromHtml", () => {
  it("extracts a full recipe from JSON-LD", () => {
    const r = extractRecipeFromHtml(withJsonLd(RECIPE));
    expect(r).not.toBeNull();
    expect(r!.title).toBe("Greek Chicken Burgers");
    expect(r!.ingredients.map((i) => i.display_text)).toEqual(["2 chicken breasts", "100g feta"]);
    expect(r!.steps).toEqual(["Marinate the chicken.", "Griddle until charred."]);
    expect(r!.servings).toBe("2 servings");
    expect(r!.prep_time).toBe("10 min");
    expect(r!.cook_time).toBe("12 min");
    expect(r!.imageUrl).toBe("https://example.com/burger.jpg");
  });

  it("finds a Recipe nested in an @graph", () => {
    const graph = { "@context": "https://schema.org", "@graph": [{ "@type": "WebPage" }, RECIPE] };
    expect(extractRecipeFromHtml(withJsonLd(graph))?.title).toBe("Greek Chicken Burgers");
  });

  it("splits newline-joined string instructions", () => {
    const r = extractRecipeFromHtml(
      withJsonLd({ ...RECIPE, recipeInstructions: "Step one.\nStep two.\nStep three." }),
    );
    expect(r!.steps).toEqual(["Step one.", "Step two.", "Step three."]);
  });

  it("returns null when there is no recipe or it lacks content", () => {
    expect(extractRecipeFromHtml("<html><body>nothing</body></html>")).toBeNull();
    expect(extractRecipeFromHtml(withJsonLd({ "@type": "Recipe", name: "Empty" }))).toBeNull();
  });
});
