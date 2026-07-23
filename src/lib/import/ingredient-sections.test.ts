import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSectionedIngredientGroups } from "./ingredient-sections";

const fixture = (name: string): string =>
  readFileSync(`src/lib/import/__fixtures__/${name}`, "utf8");

// The real King Arthur "Glazed Lemon Bundt Cake" markup: three `div.ingredient-section`
// blocks, each `<p>` heading + `ul.list--bullets`, product `<a>` links inside the <li>s,
// and a footnote `<p>` that must NOT be mistaken for a section heading.
const KA = fixture("king-arthur-lemon-bundt.html");
const KA_FLAT = [
  "16 tablespoons (227g) unsalted butter, at room temperature, at least 65°F*",
  "2 cups (397g) granulated sugar",
  "1 teaspoon table salt",
  "4 large eggs, at room temperature",
  "2 teaspoons baking powder",
  "3 cups (360g) King Arthur Unbleached All-Purpose Flour",
  "1 cup (227g) milk, whole milk preferred, at room temperature",
  "zest of 2 lemons or 3/4 teaspoon lemon oil",
  "1/4 cup (24g) King Arthur Almond Flour, for dusting baking pan, optional",
  "1/3 cup (74g) freshly squeezed lemon juice, the juice of about 1 1/2 juicy lemons",
  "3/4 cup (149g) granulated sugar",
  "1 1/2 cups (170g) confectioners' sugar, sifted",
  "pinch of table salt",
  "2 to 3 tablespoons (28g to 43g) freshly squeezed lemon juice",
];

// A generic non-WPRM section: a heading element immediately followed by a <ul> of <li>s.
const section = (heading: string, items: string[]): string =>
  `<p class="list-heading">${heading}</p><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

describe("parseSectionedIngredientGroups", () => {
  it("recovers the real King Arthur sections (Cake / Glaze / Icing), verbatim from schema.org (AC1)", () => {
    const groups = parseSectionedIngredientGroups(KA, KA_FLAT);
    expect(groups).toEqual([
      {
        name: "Cake",
        ingredients: [
          "16 tablespoons (227g) unsalted butter, at room temperature, at least 65°F*",
          "2 cups (397g) granulated sugar",
          "1 teaspoon table salt",
          "4 large eggs, at room temperature",
          "2 teaspoons baking powder",
          "3 cups (360g) King Arthur Unbleached All-Purpose Flour",
          "1 cup (227g) milk, whole milk preferred, at room temperature",
          "zest of 2 lemons or 3/4 teaspoon lemon oil",
          "1/4 cup (24g) King Arthur Almond Flour, for dusting baking pan, optional",
        ],
      },
      {
        name: "Glaze",
        ingredients: [
          "1/3 cup (74g) freshly squeezed lemon juice, the juice of about 1 1/2 juicy lemons",
          "3/4 cup (149g) granulated sugar",
        ],
      },
      {
        name: "Icing (optional)",
        ingredients: [
          "1 1/2 cups (170g) confectioners' sugar, sifted",
          "pinch of table salt",
          "2 to 3 tablespoons (28g to 43g) freshly squeezed lemon juice",
        ],
      },
    ]);
  });

  it("emits EXACTLY the schema.org multiset — nothing added, dropped, or duplicated (AC2)", () => {
    const groups = parseSectionedIngredientGroups(KA, KA_FLAT)!;
    const emitted = groups.flatMap((g) => g.ingredients).sort();
    expect(emitted).toEqual([...KA_FLAT].sort());
  });

  it("does not mistake the footnote <p> for a section heading", () => {
    const names = parseSectionedIngredientGroups(KA, KA_FLAT)!.map((g) => g.name);
    expect(names).toEqual(["Cake", "Glaze", "Icing (optional)"]);
  });

  it("strips a trailing colon from the heading (\"For the chicken:\" -> \"For the chicken\")", () => {
    const flat = ["2 chicken breasts", "1 tsp salt", "1 cup rice", "2 cups water"];
    const html = section("For the chicken:", ["2 chicken breasts", "1 tsp salt"]) + section("For the rice:", ["1 cup rice", "2 cups water"]);
    const groups = parseSectionedIngredientGroups(html, flat);
    expect(groups?.map((g) => g.name)).toEqual(["For the chicken", "For the rice"]);
  });

  it("counts duplicate ingredients by MULTISET, not set — accepts matched duplicates (finding: multiset)", () => {
    // "salt" appears twice in the flat list AND twice across the sections: a valid match.
    const flat = ["1 tsp salt", "2 cups flour", "1 tsp salt", "1 cup sugar"];
    const html = section("Dough", ["2 cups flour", "1 tsp salt"]) + section("Topping", ["1 cup sugar", "1 tsp salt"]);
    const groups = parseSectionedIngredientGroups(html, flat);
    expect(groups?.flatMap((g) => g.ingredients).filter((i) => i === "1 tsp salt")).toHaveLength(2);
  });

  it("rejects when the sections carry MORE copies of an ingredient than schema.org (finding: multiset)", () => {
    // A set check would accept {salt,flour,sugar} == {salt,flour,sugar}; multiset must not.
    const flat = ["1 tsp salt", "2 cups flour", "1 cup sugar"]; // one salt
    const html = section("Dough", ["2 cups flour", "1 tsp salt"]) + section("Topping", ["1 cup sugar", "1 tsp salt"]); // two salts
    expect(parseSectionedIngredientGroups(html, flat)).toBeNull();
  });

  it("returns null for a flat recipe with a single ingredient list (AC3)", () => {
    const flat = ["2 cups flour", "1 tsp salt", "1 cup sugar"];
    const html = `<h2>Ingredients</h2><ul>${flat.map((i) => `<li>${i}</li>`).join("")}</ul>`;
    expect(parseSectionedIngredientGroups(html, flat)).toBeNull();
  });

  it("ignores an unrelated decoy list (related recipes / notes) and recovers only the recipe's sections (AC4)", () => {
    const flat = ["2 chicken breasts", "1 tsp salt", "1 cup rice", "2 cups water"];
    const decoy = section("You might also like", ["Chocolate cake", "Banana bread", "Apple pie"]);
    const html =
      section("For the chicken", ["2 chicken breasts", "1 tsp salt"]) +
      section("For the rice", ["1 cup rice", "2 cups water"]) +
      decoy;
    const groups = parseSectionedIngredientGroups(html, flat);
    expect(groups?.map((g) => g.name)).toEqual(["For the chicken", "For the rice"]);
  });

  it("scopes to the SELECTED recipe's flat list when the page has two recipe cards (finding: recipe scoping)", () => {
    const flatA = ["2 cups flour", "1 tsp salt", "1 cup sugar", "2 eggs"];
    const cardA = section("Batter", ["2 cups flour", "2 eggs"]) + section("Glaze", ["1 tsp salt", "1 cup sugar"]);
    const cardB = section("Broth", ["1 onion", "2 carrots"]) + section("Garnish", ["parsley", "chives"]);
    const groups = parseSectionedIngredientGroups(cardA + cardB, flatA);
    expect(groups?.map((g) => g.name)).toEqual(["Batter", "Glaze"]);
    expect(groups?.flatMap((g) => g.ingredients).sort()).toEqual([...flatA].sort());
  });

  it("returns null when there are no headed lists at all", () => {
    expect(parseSectionedIngredientGroups("<div>just prose, no lists</div>", ["a", "b"])).toBeNull();
  });
});
