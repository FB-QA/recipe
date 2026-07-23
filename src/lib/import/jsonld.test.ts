import { readFileSync } from "node:fs";
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
  it("decodes HTML entities the page encoded in its JSON-LD (title, description, steps, ingredients)", () => {
    // RecipeTinEats etc. HTML-encode apostrophes and ampersands inside their JSON-LD
    // strings; JSON.parse leaves them literal, so we must decode ("don&#39;t" → "don't").
    const r = extractRecipeFromHtml(
      withJsonLd({
        ...RECIPE,
        name: "Grandma&#39;s Mac &amp; Cheese",
        description: "It&#39;s the best &ndash; you won&rsquo;t believe it.",
        recipeIngredient: ["1&frac12; cups salt &amp; pepper", "2 tbsp Franks&#39;s hot sauce"],
        recipeInstructions: [
          { "@type": "HowToStep", text: "Don&#39;t overmix the batter." },
          "Bake until it&#39;s golden.",
        ],
      }),
    );
    expect(r!.title).toBe("Grandma's Mac & Cheese");
    expect(r!.description).toBe("It's the best – you won't believe it.");
    expect(r!.ingredientGroups[0].ingredients.map((i) => i.originalText)).toEqual([
      "1½ cups salt & pepper",
      "2 tbsp Franks's hot sauce",
    ]);
    expect(r!.steps.map((s) => s.instruction)).toEqual(["Don't overmix the batter.", "Bake until it's golden."]);
  });

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

  it("recovers WP Recipe Maker ingredient sections the flat JSON-LD list loses", () => {
    // Same recipe, but the page carries WPRM section markup (RecipeTineats et al.).
    // JSON-LD has no groups, so we lift the named sections out of the HTML.
    const recipe = {
      ...RECIPE,
      recipeIngredient: ["2 chicken breasts", "100g feta", "1 tbsp olive oil", "1 lemon"],
    };
    const wprm = `
      <div class="wprm-recipe-ingredient-group">
        <h4 class="wprm-recipe-ingredient-group-name">Burgers</h4>
        <ul>
          <li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-amount">2</span><span class="wprm-recipe-ingredient-name">chicken breasts</span></li>
          <li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-amount">100g</span><span class="wprm-recipe-ingredient-name">feta</span></li>
        </ul>
      </div>
      <div class="wprm-recipe-ingredient-group">
        <h4 class="wprm-recipe-ingredient-group-name">To serve</h4>
        <ul>
          <li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-amount">1 tbsp</span><span class="wprm-recipe-ingredient-name">olive oil</span></li>
          <li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-amount">1</span><span class="wprm-recipe-ingredient-name">lemon</span></li>
        </ul>
      </div>`;
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(recipe)}</script></head><body>${wprm}</body></html>`;
    const r = extractRecipeFromHtml(html);
    expect(r!.ingredientGroups.map((g) => g.name)).toEqual(["Burgers", "To serve"]);
    expect(r!.ingredientGroups[0].ingredients.map((i) => i.originalText)).toEqual(["2 chicken breasts", "100g feta"]);
    expect(r!.ingredientGroups[1].ingredients.map((i) => i.originalText)).toEqual(["1 tbsp olive oil", "1 lemon"]);
    // Positions stay continuous across sections.
    expect(r!.ingredientGroups.flatMap((g) => g.ingredients).map((i) => i.position)).toEqual([0, 1, 2, 3]);
  });

  it("falls back to one unnamed group when a page has no WPRM sections", () => {
    const r = extractRecipeFromHtml(withJsonLd(RECIPE));
    expect(r!.ingredientGroups).toHaveLength(1);
    expect(r!.ingredientGroups[0].name).toBeNull();
  });

  it("keeps a named section for a valid one-ingredient recipe (exact count match)", () => {
    const recipe = { ...RECIPE, recipeIngredient: ["1 whole chicken"] };
    const wprm = `
      <div class="wprm-recipe-ingredient-group">
        <h4 class="wprm-recipe-ingredient-group-name">The bird</h4>
        <ul><li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-amount">1</span><span class="wprm-recipe-ingredient-name">whole chicken</span></li></ul>
      </div>`;
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(recipe)}</script></head><body>${wprm}</body></html>`;
    const r = extractRecipeFromHtml(html);
    expect(r!.ingredientGroups.map((g) => g.name)).toEqual(["The bird"]);
    expect(r!.ingredientGroups[0].ingredients.map((i) => i.originalText)).toEqual(["1 whole chicken"]);
  });

  it("recovers GENERIC (non-WPRM) sections from real King Arthur markup, verbatim (AC1)", () => {
    // Real captured "Glazed Lemon Bundt Cake": div.ingredient-section > p + ul.list--bullets,
    // product <a> links inside the <li>s, JSON-LD stays flat. No WPRM markup, no AI.
    const html = readFileSync("src/lib/import/__fixtures__/king-arthur-lemon-bundt.html", "utf8");
    const r = extractRecipeFromHtml(html);
    expect(r!.ingredientGroups.map((g) => g.name)).toEqual(["Cake", "Glaze", "Icing (optional)"]);
    expect(r!.ingredientGroups[0].ingredients.map((i) => i.originalText)).toEqual([
      "16 tablespoons (227g) unsalted butter, at room temperature, at least 65°F*",
      "2 cups (397g) granulated sugar",
      "1 teaspoon table salt",
      "4 large eggs, at room temperature",
      "2 teaspoons baking powder",
      "3 cups (360g) King Arthur Unbleached All-Purpose Flour",
      "1 cup (227g) milk, whole milk preferred, at room temperature",
      "zest of 2 lemons or 3/4 teaspoon lemon oil",
      "1/4 cup (24g) King Arthur Almond Flour, for dusting baking pan, optional",
    ]);
    expect(r!.ingredientGroups[1].ingredients.map((i) => i.originalText)).toEqual([
      "1/3 cup (74g) freshly squeezed lemon juice, the juice of about 1 1/2 juicy lemons",
      "3/4 cup (149g) granulated sugar",
    ]);
    // Positions stay continuous across all three sections (14 ingredients).
    expect(r!.ingredientGroups.flatMap((g) => g.ingredients).map((i) => i.position)).toEqual(
      Array.from({ length: 14 }, (_, i) => i),
    );
  });

  it("WPRM still wins first — a WPRM page is unaffected by the generic parser (AC5)", () => {
    const recipe = { ...RECIPE, recipeIngredient: ["2 chicken breasts", "100g feta", "1 tbsp olive oil", "1 lemon"] };
    const wprm = `
      <div class="wprm-recipe-ingredient-group">
        <h4 class="wprm-recipe-ingredient-group-name">Burgers</h4>
        <ul>
          <li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-name">2 chicken breasts</span></li>
          <li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-name">100g feta</span></li>
        </ul>
      </div>
      <div class="wprm-recipe-ingredient-group">
        <h4 class="wprm-recipe-ingredient-group-name">To serve</h4>
        <ul>
          <li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-name">1 tbsp olive oil</span></li>
          <li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-name">1 lemon</span></li>
        </ul>
      </div>`;
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(recipe)}</script></head><body>${wprm}</body></html>`;
    const r = extractRecipeFromHtml(html);
    expect(r!.ingredientGroups.map((g) => g.name)).toEqual(["Burgers", "To serve"]);
    // The group carries the WPRM provenance marker — not the generic `sec-g*` one.
    expect(r!.ingredientGroups[0].temporaryId).toBe("wprm-g0");
  });

  it("splits newline-joined string instructions and keeps step order", () => {
    const r = extractRecipeFromHtml(
      withJsonLd({ ...RECIPE, recipeInstructions: "Step one.\nStep two.\nStep three." }),
    );
    expect(r!.steps.map((s) => s.instruction)).toEqual(["Step one.", "Step two.", "Step three."]);
    expect(r!.steps.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it("splits a single HowToStep that crams every step into one numbered blob", () => {
    // WP Recipe Maker (e.g. halfbakedharvest.com) emits the whole method as one
    // HowToStep whose text runs the steps together with "1." "2." markers and no
    // line breaks. Left whole, all six steps import as a single step.
    const blob =
      "1. To make the salad, combine the ingredients and toss. Set aside." +
      "2. Heat the oil until hot but not smoking." +
      "3. Combine the aromatics, then pour the hot oil over." +
      "4. Cook the beef until browned, about 5 minutes. Stir in the tamari." +
      "5. Cook the noodles, then toss with the herb oil." +
      "6. Divide among bowls and top with cashews.";
    const r = extractRecipeFromHtml(withJsonLd({ ...RECIPE, recipeInstructions: [{ "@type": "HowToStep", text: blob }] }));
    expect(r!.steps).toHaveLength(6);
    expect(r!.steps[0].instruction).toBe("To make the salad, combine the ingredients and toss. Set aside.");
    expect(r!.steps[3].instruction).toBe("Cook the beef until browned, about 5 minutes. Stir in the tamari.");
    expect(r!.steps[5].instruction).toBe("Divide among bowls and top with cashews.");
    expect(r!.steps.map((s) => s.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("keeps a lead-in sentence hugged to the first marker on step one", () => {
    const r = extractRecipeFromHtml(
      withJsonLd({ ...RECIPE, recipeInstructions: [{ "@type": "HowToStep", text: "Make the salad first.1. Chop the onion.2. Fry it off." }] }),
    );
    expect(r!.steps.map((s) => s.instruction)).toEqual(["Make the salad first. Chop the onion.", "Fry it off."]);
  });

  it("does not split prose that cross-references step numbers", () => {
    // "step 1. … step 2." are references inside one instruction, not list
    // markers — they sit after a word, not at a sentence boundary. Splitting here
    // would scramble the text, which is worse than leaving it whole.
    const r = extractRecipeFromHtml(
      withJsonLd({ ...RECIPE, recipeInstructions: [{ "@type": "HowToStep", text: "Fold as in step 1. Then repeat for step 2. Serve warm." }] }),
    );
    expect(r!.steps).toHaveLength(1);
    expect(r!.steps[0].instruction).toBe("Fold as in step 1. Then repeat for step 2. Serve warm.");
  });

  it("splits the method and leaves trailing numbered notes on the last step", () => {
    // A real method followed by a numbered notes block restarts the numbering;
    // split on the ascending 1,2,3 run and let the notes ride on the last step
    // rather than rejecting the whole enumeration.
    const r = extractRecipeFromHtml(
      withJsonLd({
        ...RECIPE,
        recipeInstructions: [{ "@type": "HowToStep", text: "1. Brown the beef.2. Add the sauce.3. Simmer 20 minutes. Notes: 1. Freezes well. 2. Doubles easily." }],
      }),
    );
    expect(r!.steps).toHaveLength(3);
    expect(r!.steps[0].instruction).toBe("Brown the beef.");
    expect(r!.steps[2].instruction).toBe("Simmer 20 minutes. Notes: 1. Freezes well. 2. Doubles easily.");
  });

  it("does not split a run interrupted by a gap (1, 2, 4)", () => {
    const r = extractRecipeFromHtml(
      withJsonLd({ ...RECIPE, recipeInstructions: [{ "@type": "HowToStep", text: "1. First.2. Second.4. Fourth." }] }),
    );
    expect(r!.steps).toHaveLength(1);
  });

  it("recognises a colon-prefixed numbered method (Directions: 1. … 2. …)", () => {
    const r = extractRecipeFromHtml(
      withJsonLd({ ...RECIPE, recipeInstructions: [{ "@type": "HowToStep", text: "Directions: 1. Mix the batter. 2. Bake until golden." }] }),
    );
    expect(r!.steps.map((s) => s.instruction)).toEqual(["Directions: Mix the batter.", "Bake until golden."]);
  });

  it("does not split an out-of-order marker run", () => {
    // Markers must read 1, 2, 3… in text order. "1. … 3. … 2." is not a clean
    // enumeration; splitting on 1 and 2 would embed "3. Third." inside step one.
    const r = extractRecipeFromHtml(
      withJsonLd({ ...RECIPE, recipeInstructions: [{ "@type": "HowToStep", text: "1. First.3. Third.2. Second." }] }),
    );
    expect(r!.steps).toHaveLength(1);
  });

  it("does not split a decimal written with a space ('1. 5 hours')", () => {
    const r = extractRecipeFromHtml(
      withJsonLd({ ...RECIPE, recipeInstructions: [{ "@type": "HowToStep", text: "Roast for 1. 5 hours, then rest for 2. 5 hours." }] }),
    );
    expect(r!.steps).toHaveLength(1);
  });

  it("does not split a lone number or a temperature that is not an enumeration", () => {
    // "375°" and "1.5" must not be mistaken for step markers — only a run that
    // reads 1, 2, 3… from the start is an enumeration.
    const r = extractRecipeFromHtml(
      withJsonLd({ ...RECIPE, recipeInstructions: [{ "@type": "HowToStep", text: "Preheat to 375. Add 1.5 cups flour and bake." }] }),
    );
    expect(r!.steps).toHaveLength(1);
    expect(r!.steps[0].instruction).toBe("Preheat to 375. Add 1.5 cups flour and bake.");
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

  it("stops @graph traversal past the recursion cap (no unbounded recursion)", () => {
    // A valid recipe buried deeper than the @graph depth cap (32) is not reached:
    // the cap is what stops findRecipeNode recursing unbounded on a hostile deeply
    // nested payload. Depth 40 is past the cap but shallow enough that building and
    // parsing the JSON is itself safe — without the cap this would resolve the recipe.
    let node: object = { "@type": "Recipe", name: "Deep", recipeIngredient: ["1 egg"], recipeInstructions: ["mix"] };
    for (let i = 0; i < 40; i++) node = { "@graph": node };
    expect(extractRecipeFromHtml(withJsonLd(node))).toBeNull();
  });

  it("resolves a recipe nested within the @graph depth cap", () => {
    let node: object = { "@type": "Recipe", name: "Shallow", recipeIngredient: ["1 egg"], recipeInstructions: ["mix"] };
    for (let i = 0; i < 3; i++) node = { "@graph": node };
    expect(extractRecipeFromHtml(withJsonLd(node))?.title).toBe("Shallow");
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
