import { describe, it, expect } from "vitest";
import { highlightStep, ingredientTerms } from "@/lib/recipes/highlight";

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
