import { describe, expect, it } from "vitest";
import { parseWprmIngredientGroups } from "./wprm";

// Markup mirrors WP Recipe Maker's real output (RecipeTineats et al.): the group
// heading carries BOTH `wprm-recipe-group-name` and the more specific
// `wprm-recipe-ingredient-group-name`; instruction groups reuse the generic class,
// so we must key on the specific one. Each ingredient's text is spread across
// amount/unit/name/notes spans, with checkbox + screen-reader junk in between.
const SAMPLE = `
<h3>Ingredients</h3>
<div class="wprm-recipe-ingredient-group">
  <h4 class="wprm-recipe-group-name wprm-recipe-ingredient-group-name wprm-block-text-bold">Noodles</h4>
  <ul class="wprm-recipe-ingredients">
    <li class="wprm-recipe-ingredient" data-uid="1">
      <span class="wprm-checkbox-container"><input type="checkbox"><label><span class="sr-only wprm-screen-reader-text">&#9634; </span></label></span>
      <span class="wprm-recipe-ingredient-amount">200g / 7 oz</span>
      <span class="wprm-recipe-ingredient-name">dried wide rice stick noodles</span>
      <span class="wprm-recipe-ingredient-notes">(Note 1)</span>
    </li>
  </ul>
</div>
<div class="wprm-recipe-ingredient-group">
  <h4 class="wprm-recipe-group-name wprm-recipe-ingredient-group-name">Sauce</h4>
  <ul class="wprm-recipe-ingredients">
    <li class="wprm-recipe-ingredient">
      <span class="wprm-recipe-ingredient-amount">2</span>
      <span class="wprm-recipe-ingredient-unit">tsp</span>
      <span class="wprm-recipe-ingredient-name">dark soy sauce</span>
      <span class="wprm-recipe-ingredient-notes">(Note 2)</span>
    </li>
    <li class="wprm-recipe-ingredient">
      <span class="wprm-recipe-ingredient-amount">1</span>
      <span class="wprm-recipe-ingredient-name">garlic clove</span>
    </li>
  </ul>
</div>
<h3>Instructions</h3>
<div class="wprm-recipe-instruction-group">
  <h4 class="wprm-recipe-group-name wprm-recipe-instruction-group-name">Cooking:</h4>
</div>
`;

describe("parseWprmIngredientGroups", () => {
  it("returns the named ingredient groups with their ingredients", () => {
    const groups = parseWprmIngredientGroups(SAMPLE);
    expect(groups).toEqual([
      { name: "Noodles", ingredients: ["200g / 7 oz dried wide rice stick noodles (Note 1)"] },
      { name: "Sauce", ingredients: ["2 tsp dark soy sauce (Note 2)", "1 garlic clove"] },
    ]);
  });

  it("ignores instruction groups (which reuse the generic group-name class)", () => {
    const groups = parseWprmIngredientGroups(SAMPLE);
    expect(groups?.map((g) => g.name)).not.toContain("Cooking:");
  });

  it("returns null when the page has no WPRM ingredient groups", () => {
    expect(parseWprmIngredientGroups("<div>just a plain page</div>")).toBeNull();
  });

  it("decodes entities in ingredient text", () => {
    const html = `
      <div class="wprm-recipe-ingredient-group">
        <h4 class="wprm-recipe-ingredient-group-name">Base</h4>
        <ul><li class="wprm-recipe-ingredient">
          <span class="wprm-recipe-ingredient-amount">1</span>
          <span class="wprm-recipe-ingredient-name">salt &amp; pepper</span>
        </li></ul>
      </div>`;
    expect(parseWprmIngredientGroups(html)).toEqual([
      { name: "Base", ingredients: ["1 salt & pepper"] },
    ]);
  });

  it("keeps an unnamed leading group's ingredients rather than dropping them", () => {
    const html = `
      <div class="wprm-recipe-ingredient-group">
        <ul><li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-name">flour</span></li></ul>
      </div>
      <div class="wprm-recipe-ingredient-group">
        <h4 class="wprm-recipe-ingredient-group-name">Topping</h4>
        <ul><li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-name">sugar</span></li></ul>
      </div>`;
    expect(parseWprmIngredientGroups(html)).toEqual([
      { name: null, ingredients: ["flour"] },
      { name: "Topping", ingredients: ["sugar"] },
    ]);
  });

  it("keeps an unnamed group that FOLLOWS a named one as its own section", () => {
    // The wrapper is the boundary — an unheaded group must not merge into the
    // previous named one (Codex finding on wprm.ts).
    const html = `
      <div class="wprm-recipe-ingredient-group">
        <h4 class="wprm-recipe-ingredient-group-name">Main</h4>
        <ul><li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-name">beef</span></li></ul>
      </div>
      <div class="wprm-recipe-ingredient-group">
        <ul><li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-name">oil</span></li></ul>
      </div>`;
    expect(parseWprmIngredientGroups(html)).toEqual([
      { name: "Main", ingredients: ["beef"] },
      { name: null, ingredients: ["oil"] },
    ]);
  });

  it("parses only the first recipe when the page has two WPRM cards", () => {
    // A related-recipe / print variant lives in a second ingredients-container;
    // its groups must not leak into the first recipe (Codex finding on jsonld.ts).
    const card = (name: string, ing: string) => `
      <div class="wprm-recipe-ingredients-container">
        <div class="wprm-recipe-ingredient-group">
          <h4 class="wprm-recipe-ingredient-group-name">${name}</h4>
          <ul><li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-name">${ing}</span></li></ul>
        </div>
      </div>`;
    const groups = parseWprmIngredientGroups(card("First", "flour") + card("Second", "sugar"));
    expect(groups).toEqual([{ name: "First", ingredients: ["flour"] }]);
  });

  // A named recipe card with its ingredients section, in document order.
  const recipeCard = (name: string, groupName: string, ing: string) => `
    <div class="wprm-recipe-container"><h2 class="wprm-recipe-name">${name}</h2>
      <div class="wprm-recipe-ingredients-container">
        <div class="wprm-recipe-ingredient-group">
          <h4 class="wprm-recipe-ingredient-group-name">${groupName}</h4>
          <ul><li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-name">${ing}</span></li></ul>
        </div>
      </div>
    </div>`;

  it("associates groups with the SELECTED recipe, not just the first card", () => {
    // A related recipe appears BEFORE the one the JSON-LD selected — the title picks
    // the right card (Codex finding: associate WPRM markup with the JSON-LD recipe).
    const html = recipeCard("Related Cake", "Batter", "flour") + recipeCard("Main Curry", "Spices", "cumin");
    expect(parseWprmIngredientGroups(html, "Main Curry")).toEqual([{ name: "Spices", ingredients: ["cumin"] }]);
  });

  it("matches the recipe name despite punctuation (hyphen vs en-dash)", () => {
    // Real case: JSON-LD title has an ASCII hyphen, WPRM name has &ndash;.
    const html = recipeCard("Pad See Ew &ndash; Thai Noodles", "Sauce", "soy sauce");
    expect(parseWprmIngredientGroups(html, "Pad See Ew - Thai Noodles")).toEqual([
      { name: "Sauce", ingredients: ["soy sauce"] },
    ]);
  });

  it("does not guess when several recipes are present and none matches the title", () => {
    const html = recipeCard("Cake", "Batter", "flour") + recipeCard("Soup", "Base", "stock");
    expect(parseWprmIngredientGroups(html, "Totally Different Dish")).toBeNull();
  });
});
