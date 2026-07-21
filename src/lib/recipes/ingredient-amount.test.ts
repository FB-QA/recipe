import { describe, it, expect } from "vitest";
import { renderIngredientAmount, type AmountIngredient } from "./ingredient-amount";

const ing = (o: Partial<AmountIngredient> & { display_text: string }): AmountIngredient => o;

describe("renderIngredientAmount", () => {
  it("Original scales the imported line without converting", () => {
    const r = renderIngredientAmount(ing({ display_text: "1 cup flour", quantity_value: 1, unit: "cup", name: "flour" }), {
      scale: 2,
      targetSystem: "original",
    });
    expect(r.status).toBe("original");
    expect(r.text).toBe("2 cup flour");
    expect(r.approximate).toBe(false);
  });

  it("converts a known-region US cup to ml, exactly (not approximate)", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "1 cup flour", quantity_value: 1, unit: "cup", name: "flour" }),
      { scale: 1, targetSystem: "metric", sourceRegion: "us" },
    );
    expect(r.status).toBe("converted");
    expect(r.approximate).toBe(false);
    expect(r.text).toBe("237 ml flour");
  });

  it("preserves a region-sensitive unit as original when region is unknown", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "1 cup flour", quantity_value: 1, unit: "cup", name: "flour" }),
      { scale: 1, targetSystem: "metric", sourceRegion: undefined },
    );
    expect(r.status).toBe("ambiguous_region");
    expect(r.text).toBe("1 cup flour"); // unchanged fallback
  });

  it("converts a region-independent weight without needing a region", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "8 oz butter", quantity_value: 8, unit: "oz", name: "butter" }),
      { scale: 1, targetSystem: "metric" },
    );
    expect(r.status).toBe("converted");
    expect(r.text).toBe("227 g butter");
  });

  it("scales THEN converts from the original value (no drift)", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "8 oz butter", quantity_value: 8, unit: "oz", name: "butter" }),
      { scale: 2, targetSystem: "metric" },
    );
    // 16 oz → 453.6 g → friendly kg
    expect(r.status).toBe("converted");
    expect(r.text).toMatch(/^0?\.45 kg butter$|^454 g butter$|^0.45 kg butter$/);
  });

  it("converts a real structured range (quantity_value null, quantity_min/max set)", () => {
    const r = renderIngredientAmount(
      // The production shape for a range: no quantity_value, bounds in min/max.
      ing({ display_text: "200–250 g flour", quantity_value: null, quantity_min: 200, quantity_max: 250, unit: "g", name: "flour" }),
      { scale: 1, targetSystem: "us" },
    );
    expect(r.status).toBe("converted");
    expect(r.text).toMatch(/–/); // a range dash
    expect(r.text).toMatch(/oz flour$/);
  });

  it("falls back to text scaling when the quantity is missing", () => {
    const r = renderIngredientAmount(ing({ display_text: "Salt to taste" }), { scale: 2, targetSystem: "metric" });
    expect(r.status).toBe("missing_quantity");
    expect(r.text).toBe("Salt to taste");
  });

  it("falls back on an unrecognised unit (count nouns)", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "2 eggs", quantity_value: 2, unit: null, name: "eggs" }),
      { scale: 2, targetSystem: "metric" },
    );
    expect(r.status).toBe("unrecognised_unit");
    expect(r.text).toBe("4 eggs");
  });

  it("legacy-parses a row with null structured fields", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "500 ml milk", quantity_value: null, unit: null, name: "milk" }),
      { scale: 1, targetSystem: "metric" },
    );
    expect(r.status).toBe("converted");
    expect(r.text).toMatch(/milk$/);
  });

  it("keeps ONE unit across a range that crosses a threshold", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "900–1100 ml stock", quantity_value: null, quantity_min: 900, quantity_max: 1100, unit: "ml", name: "stock" }),
      { scale: 1, targetSystem: "metric" },
    );
    expect(r.status).toBe("converted");
    // Not a mismatched "900–1.1 ml" — both ends in litres.
    expect(r.text).toBe("0.9–1.1 L stock");
  });

  it("renders volume in US units when US is selected (not ml)", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "500 ml milk", quantity_value: 500, unit: "ml", name: "milk" }),
      { scale: 1, targetSystem: "us" },
    );
    expect(r.status).toBe("converted");
    expect(r.text).toMatch(/cup/); // ~2 US cups, not "500 ml"
    expect(r.text).not.toMatch(/ml/);
  });

  it("promotes US weight to pounds for large amounts (2 kg → lb, not 70 oz)", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "2 kg beef", quantity_value: 2, unit: "kg", name: "beef" }),
      { scale: 1, targetSystem: "us" },
    );
    expect(r.status).toBe("converted");
    expect(r.text).toMatch(/lb beef$/); // ~4⅜ lb
    expect(r.text).not.toMatch(/oz/);
  });

  it("keeps a small US weight in ounces", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "100 g almonds", quantity_value: 100, unit: "g", name: "almonds" }),
      { scale: 1, targetSystem: "us" },
    );
    expect(r.text).toMatch(/oz almonds$/); // ~3½ oz
  });

  it("keeps UK/Ireland volume in millilitres (favours metric per §26)", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "500 ml milk", quantity_value: 500, unit: "ml", name: "milk" }),
      { scale: 1, targetSystem: "uk_ie" },
    );
    expect(r.text).toMatch(/500 ml/);
  });

  it("legacy-parses the unit after a modifier ('about 500g')", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "about 500g chicken", quantity_value: null, unit: null, name: "chicken" }),
      { scale: 1, targetSystem: "us" },
    );
    expect(r.status).toBe("converted");
    expect(r.text).toMatch(/lb chicken$/); // used the g unit (500g → 1.1 lb), not "about"
  });

  it("derives a name when the structured name is missing", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "8 oz butter", quantity_value: 8, unit: "oz", name: null }),
      { scale: 1, targetSystem: "metric" },
    );
    expect(r.text).toBe("227 g butter");
  });

  it("derives a clean name past a modifier when structured name is missing", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "about 500g chicken", quantity_value: null, unit: null, name: null }),
      { scale: 1, targetSystem: "us" },
    );
    expect(r.status).toBe("converted");
    // Not "1⅛ lb about 500g chicken" — the modifier + amount are stripped.
    expect(r.text).toMatch(/lb chicken$/);
    expect(r.text).not.toMatch(/about|500/);
  });

  it("preserves the preparation field through conversion", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "100 g pecans, toasted", quantity_value: 100, unit: "g", name: "pecans", preparation: "toasted" }),
      { scale: 1, targetSystem: "us" },
    );
    expect(r.status).toBe("converted");
    expect(r.text).toMatch(/pecans, toasted$/);
  });

  it("parses a multi-word legacy unit ('8 fl oz')", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "8 fl oz milk", quantity_value: null, unit: null, name: null }),
      { scale: 1, targetSystem: "metric", sourceRegion: "us" },
    );
    expect(r.status).toBe("converted"); // "fl oz" resolved, not just "fl"
    expect(r.text).toMatch(/ml milk$/);
  });

  it("does NOT snap a tiny US spoon amount to a misleading fraction", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "1 ml vanilla", quantity_value: 1, unit: "ml", name: "vanilla" }),
      { scale: 1, targetSystem: "us" },
    );
    // 1 ml ≈ 0.2 US tsp — must NOT read as "¼ tsp" (~23% overstatement).
    expect(r.text).not.toMatch(/¼/);
    expect(r.text).toMatch(/tsp vanilla$/);
  });

  it("does NOT portion-scale a temperature ingredient", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "60°C water", quantity_value: 60, unit: "celsius", name: "water" }),
      { scale: 2, targetSystem: "us" },
    );
    // 60°C → 140°F regardless of the 2× portion factor (not 120°C → 250°F).
    expect(r.text).toMatch(/140\s*°F water$/);
    expect(r.text).not.toMatch(/250/);
  });

  it.each(["¼", "⅓", "⅕", "⅖", "⅙", "⅒", "½", "¾", "⅛"])(
    "resolves the unit for a legacy '%s cup oil' — a fraction is never a blocker",
    (frac) => {
      const r = renderIngredientAmount(
        ing({ display_text: `${frac} cup oil`, quantity_value: null, unit: null, name: null }),
        { scale: 1, targetSystem: "us", sourceRegion: "us" },
      );
      // The fraction is stripped, "cup" is found, and it converts (US region
      // known) — never a unrecognised-unit failure from a parser fraction gap.
      expect(r.status).toBe("converted");
      expect(r.text).toMatch(/oil$/);
    },
  );

  it("keeps ONE unit across a US-weight range that crosses the pound boundary", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "400–500 g beef", quantity_value: null, quantity_min: 400, quantity_max: 500, unit: "g", name: "beef" }),
      { scale: 1, targetSystem: "us" },
    );
    expect(r.status).toBe("converted");
    // Driven by the larger endpoint (500 g > 1 lb) → both ends in lb.
    expect(r.text).toMatch(/–.*lb beef$/);
    expect(r.text).not.toMatch(/oz/);
  });

  it("converts a line with a '/' alternative and a hyphenated name", () => {
    // Real importer shape: name holds the WHOLE line, quantity/unit null.
    const dt = "1 1/2 cups plain flour / all-purpose flour";
    const r = renderIngredientAmount(
      ing({ display_text: dt, name: dt, quantity_value: null, unit: null }),
      { scale: 1, targetSystem: "metric", sourceRegion: "metric" },
    );
    expect(r.status).toBe("converted");
    expect(r.text).toBe("375 ml plain flour / all-purpose flour");
  });

  it("does not prepend the amount to a name that is the whole line", () => {
    const dt = "8 oz butter";
    const r = renderIngredientAmount(
      ing({ display_text: dt, name: dt, quantity_value: null, unit: null }),
      { scale: 1, targetSystem: "metric" },
    );
    // "227 g butter", never "227 g 8 oz butter".
    expect(r.text).toBe("227 g butter");
    expect(r.text).not.toMatch(/oz/);
  });

  it("preserves teaspoons and tablespoons — never converts them to ml", () => {
    for (const system of ["metric", "us"] as const) {
      expect(renderIngredientAmount(ing({ display_text: "1 tsp olive oil", quantity_value: 1, unit: "tsp", name: "olive oil" }), { scale: 1, targetSystem: system }).text).toBe("1 tsp olive oil");
      expect(renderIngredientAmount(ing({ display_text: "1 tbsp red wine vinegar", quantity_value: 1, unit: "tbsp", name: "red wine vinegar" }), { scale: 1, targetSystem: system }).text).toBe("1 tbsp red wine vinegar");
    }
  });

  it("still scales a preserved spoon unit with portions", () => {
    expect(
      renderIngredientAmount(ing({ display_text: "1 tsp olive oil", quantity_value: 1, unit: "tsp", name: "olive oil" }), {
        scale: 2,
        targetSystem: "metric",
      }).text,
    ).toBe("2 tsp olive oil");
  });

  it("does not reflow an already-target-unit amount (50g stays 50g in Metric)", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "50g flour", quantity_value: 50, unit: "g", name: "flour" }),
      { scale: 1, targetSystem: "metric" },
    );
    // No unit change → keep original formatting, never "50 g flour".
    expect(r.text).toBe("50g flour");
    // And it matches Original mode exactly.
    const orig = renderIngredientAmount(
      ing({ display_text: "50g flour", quantity_value: 50, unit: "g", name: "flour" }),
      { scale: 1, targetSystem: "original" },
    );
    expect(r.text).toBe(orig.text);
  });

  it("still scales an already-target-unit amount when portions change", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "50g flour", quantity_value: 50, unit: "g", name: "flour" }),
      { scale: 2, targetSystem: "metric" },
    );
    expect(r.text).toBe("100g flour");
  });

  it("reduces a pre-written dual annotation to the selected system", () => {
    const dt = "200g / 7 oz dried noodles";
    const metric = renderIngredientAmount(ing({ display_text: dt, name: dt, quantity_value: null, unit: null }), {
      scale: 1,
      targetSystem: "metric",
    });
    expect(metric.text).toBe("200g dried noodles"); // no "/ 7 oz"
    const us = renderIngredientAmount(ing({ display_text: dt, name: dt, quantity_value: null, unit: null }), {
      scale: 1,
      targetSystem: "us",
    });
    expect(us.text).toBe("7 oz dried noodles"); // no "200g /"
  });

  it("does not convert a 'N × M<unit>' multiplier (2 x 125g stays; count scales)", () => {
    // The importer stores quantity_value: 2 (the count) with unit null; the "g"
    // belongs to 125, not the count — converting would give a nonsense 0.07 oz.
    const dt = "2 x 125g chicken breasts";
    const us = renderIngredientAmount(ing({ display_text: dt, name: "chicken breasts", quantity_value: 2, unit: null }), {
      scale: 1,
      targetSystem: "us",
      sourceRegion: "metric",
    });
    expect(us.text).toBe("2 x 125g chicken breasts");
    expect(us.text).not.toMatch(/oz/);
    // The leading count still scales with portions.
    const doubled = renderIngredientAmount(ing({ display_text: dt, name: "chicken breasts", quantity_value: 2, unit: null }), {
      scale: 2,
      targetSystem: "metric",
    });
    expect(doubled.text).toBe("4 x 125g chicken breasts");
  });

  it("always exposes the original source text", () => {
    const r = renderIngredientAmount(
      ing({ display_text: "1 cup flour", quantity_value: 1, unit: "cup", name: "flour" }),
      { scale: 1, targetSystem: "metric", sourceRegion: "us" },
    );
    expect(r.sourceText).toBe("1 cup flour");
  });
});
