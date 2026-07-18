import { describe, it, expect } from "vitest";
import { highlightStep, ingredientTerms, ingredientsInStep } from "@/lib/recipes/highlight";

describe("highlightStep", () => {
  it("bolds measures, times, and temperatures", () => {
    const bold = highlightStep("Bake for 20 minutes at 180°C", [])
      .filter((s) => s.bold)
      .map((s) => s.text.trim());
    expect(bold).toContain("20 minutes");
    expect(bold.some((b) => b.includes("180"))).toBe(true);
  });

  it("bolds ingredient terms", () => {
    const segs = highlightStep("Griddle the chicken breasts until charred", ["chicken breasts", "breasts"]);
    expect(segs.some((s) => s.bold && /chicken breasts/i.test(s.text))).toBe(true);
  });

  it("always reassembles to the original text", () => {
    const text = "Add 2 tbsp olive oil and stir for 3 minutes";
    expect(highlightStep(text, ["olive oil"]).map((s) => s.text).join("")).toBe(text);
  });
});

describe("ingredientTerms", () => {
  it("derives head terms, stripping quantities", () => {
    const terms = ingredientTerms([
      { display_text: "2 x 125g chicken breasts", name: null },
      { display_text: "1 tbsp olive oil", name: null },
    ]);
    expect(terms).toContain("breasts");
    expect(terms.some((t) => t.includes("olive oil"))).toBe(true);
  });
});

describe("ingredientsInStep", () => {
  const ingredients = [
    { id: "a", display_text: "2 cloves garlic", name: null },
    { id: "b", display_text: "1 tbsp olive oil", name: null },
    { id: "c", display_text: "200g chicken thighs", name: null },
  ];

  it("returns only the ingredients a step mentions, in ingredient order", () => {
    const got = ingredientsInStep("Fry the garlic in the olive oil, then season", ingredients);
    expect(got.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("matches an ingredient by its head noun (chicken thighs → 'thighs')", () => {
    const got = ingredientsInStep("Sear the thighs skin-side down", ingredients);
    expect(got.map((i) => i.id)).toEqual(["c"]);
  });

  it("returns nothing when a step names no ingredient", () => {
    expect(ingredientsInStep("Simmer for 20 minutes", ingredients)).toHaveLength(0);
  });

  it("does not over-match a shared head noun (olive oil vs vegetable oil)", () => {
    const oils = [
      { id: "a", display_text: "1 tbsp olive oil", name: null },
      { id: "b", display_text: "2 tbsp vegetable oil", name: null },
    ];
    // "oil" is shared, so only the full-phrase match should win.
    const got = ingredientsInStep("Heat the olive oil in a pan", oils);
    expect(got.map((i) => i.id)).toEqual(["a"]);
  });

  it("matches an ingredient written as 'X of Y' by its real noun", () => {
    const tin = [{ id: "t", display_text: "1 can of chopped tomatoes", name: null }];
    const got = ingredientsInStep("Pour in the chopped tomatoes", tin);
    expect(got.map((i) => i.id)).toEqual(["t"]);
  });
});
