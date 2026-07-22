import { describe, it, expect } from "vitest";
import { highlightStep, matchStep } from "@/lib/recipes/highlight";

// The app calls matchStep and reads .ingredients for the drawer; this mirrors that.
const inStep = <T extends { display_text: string; name: string | null }>(instruction: string, ings: T[]): T[] =>
  matchStep(instruction, ings).ingredients;

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

describe("matchStep — bold terms agree with the drawer", () => {
  it("derives head terms, stripping quantities", () => {
    const { terms } = matchStep("Griddle the chicken breasts in the olive oil", [
      { display_text: "2 x 125g chicken breasts", name: null },
      { display_text: "1 tbsp olive oil", name: null },
    ]);
    expect(terms).toContain("chicken breasts");
    expect(terms.some((t) => t.includes("olive oil"))).toBe(true);
  });

  it("returns the exact matched substring as a term, so what bolds is what the drawer shows", () => {
    // The stored name carries extra words ("whole milk") the step omits; the
    // bolded term must be the substring that actually appears, not the full name.
    const ings = [{ id: "cc", display_text: "2 cups whole milk cottage cheese", name: "2 cups whole milk cottage cheese" }];
    const step = "Add the cottage cheese to a bowl";
    const { ingredients, terms } = matchStep(step, ings);
    expect(ingredients.map((i) => i.id)).toEqual(["cc"]);
    expect(terms).toContain("cottage cheese");
    const bolded = highlightStep(step, terms).filter((s) => s.bold).map((s) => s.text.trim());
    expect(bolded).toContain("cottage cheese");
  });
});

describe("matchStep — variant & qualifier robustness (samdoesherbest cottage cheese ice cream)", () => {
  // Real import. The name flattens the parenthetical in ("mixed berries fresh or
  // frozen"), and the recipe lists a Berry *and* a Chocolate variant, so cottage
  // cheese and the sweetener each appear twice — sharing a head noun.
  const ccic = [
    { id: "cc1", display_text: "2 cups whole milk cottage cheese", name: "2 cups whole milk cottage cheese" },
    { id: "berries", display_text: "1 cup mixed berries fresh or frozen", name: "1 cup mixed berries fresh or frozen" },
    { id: "sweet1", display_text: "3 tablespoons honey or maple syrup", name: "3 tablespoons honey or maple syrup" },
    { id: "cc2", display_text: "2 cups whole milk cottage cheese", name: "2 cups whole milk cottage cheese" },
    { id: "cocoa", display_text: "1/4 cup unsweetened cocoa powder", name: "1/4 cup unsweetened cocoa powder" },
    { id: "sweet2", display_text: "1/4 cup maple syrup", name: "1/4 cup maple syrup" },
    { id: "chips", display_text: "mini chocolate chips optional", name: "mini chocolate chips optional" },
  ];
  const step1 =
    "Add the cottage cheese, mixed berries, and honey (or maple syrup) to a blender. Blend until completely smooth and creamy with no lumps remaining.";

  it("matches a shortened ingredient name past extra leading words (whole milk cottage cheese → 'cottage cheese')", () => {
    expect(inStep(step1, ccic).map((i) => i.name)).toContain("2 cups whole milk cottage cheese");
  });

  it("matches an ingredient whose head noun is a trailing qualifier (mixed berries fresh or frozen)", () => {
    expect(inStep(step1, ccic).map((i) => i.name)).toContain("1 cup mixed berries fresh or frozen");
  });

  it("shows an identical ingredient once even when two variants list it", () => {
    const cc = inStep(step1, ccic).filter((i) => i.name === "2 cups whole milk cottage cheese");
    expect(cc).toHaveLength(1);
  });

  it("does not pull chocolate-only ingredients into a berry step", () => {
    const ids = inStep(step1, ccic).map((i) => i.id);
    expect(ids).not.toContain("cocoa");
    expect(ids).not.toContain("chips");
  });

  it("does not match 'mixed berries fresh or frozen' to a step that merely says 'frozen'", () => {
    // A flattened qualifier ("… fresh or frozen") must not turn "frozen" into a
    // matchable head noun; the freezing step names no ingredient.
    const freezeStep = "Pour the mixture into a container and freeze for 6 hours, or until frozen solid.";
    expect(inStep(freezeStep, ccic).map((i) => i.id)).not.toContain("berries");
  });

  it("keeps the berry sweetener whose extra word ('honey') the step also names", () => {
    // "3 tablespoons honey or maple syrup" matches on "maple syrup" — a prefix of
    // nothing, but a phrase another (chocolate) row owns in full. It must survive
    // because its leftover word "honey" is quoted by the step; only a genuinely
    // absent leftover (see the coconut-milk-powder case) justifies dropping.
    expect(inStep(step1, ccic).map((i) => i.id)).toContain("sweet1");
  });
});

describe("matchStep — review hardening (PR #25 Codex findings)", () => {
  it("keeps two rows that share a name but differ in amount (olive oil, sauce vs dressing)", () => {
    // Deduplicating must not swallow a distinct amount the cook needs. Same name,
    // different display_text → both belong in the drawer.
    const oils = [
      { id: "sauce", display_text: "1 tbsp olive oil", name: "olive oil" },
      { id: "dressing", display_text: "3 tbsp olive oil", name: "olive oil" },
    ];
    const ids = inStep("Whisk the olive oil into the sauce, then the dressing", oils).map((i) => i.id);
    expect(ids).toEqual(["sauce", "dressing"]);
  });

  it("does not pull 'coconut milk powder' into a step that says only 'coconut milk'", () => {
    const cans = [
      { id: "milk", display_text: "1 can coconut milk", name: "1 can coconut milk" },
      { id: "powder", display_text: "2 tbsp coconut milk powder", name: "2 tbsp coconut milk powder" },
    ];
    const ids = inStep("Stir in the coconut milk and warm through", cans).map((i) => i.id);
    expect(ids).toEqual(["milk"]);
  });

  it("still surfaces the longer ingredient when it is the only claimant", () => {
    // If the plain form is absent, a step saying "coconut milk" should still find
    // the powder — shortened matching is a feature, the drop only guards collisions.
    const only = [{ id: "powder", display_text: "2 tbsp coconut milk powder", name: "2 tbsp coconut milk powder" }];
    expect(inStep("Stir in the coconut milk", only).map((i) => i.id)).toEqual(["powder"]);
  });

  it("matches 'salt to taste' when a step says 'salt'", () => {
    const s = [{ id: "salt", display_text: "salt to taste", name: "salt to taste" }];
    expect(inStep("Season with salt and serve", s).map((i) => i.id)).toEqual(["salt"]);
  });

  it("drops a trailing comma descriptor so 'parmesan, grated' matches 'the parmesan'", () => {
    const s = [
      { id: "parm", display_text: "50g parmesan, grated", name: "50g parmesan, grated" },
      { id: "ched", display_text: "100g cheddar", name: "100g cheddar" },
    ];
    expect(inStep("Stir in the parmesan until melted", s).map((i) => i.id)).toEqual(["parm"]);
  });
});

describe("matchStep — singular/plural tolerance", () => {
  const mk = (id: string, text: string) => ({ id, display_text: text, name: text });
  it("matches a plural step against a singular ingredient ('the onions' → '1 onion')", () => {
    expect(inStep("Soften the onions in butter", [mk("o", "1 onion")]).map((i) => i.id)).toEqual(["o"]);
  });
  it("matches a singular step against a plural ingredient ('the breast' → 'chicken breasts')", () => {
    expect(inStep("Sear the chicken breast skin-side down", [mk("c", "2 chicken breasts")]).map((i) => i.id)).toEqual(["c"]);
  });
  it("handles -oes and -ies plurals (tomato/tomatoes, berry/berries)", () => {
    expect(inStep("Add a tomato", [mk("t", "400g tomatoes")]).map((i) => i.id)).toEqual(["t"]);
    expect(inStep("Fold in the berries", [mk("b", "1 cup berry")]).map((i) => i.id)).toEqual(["b"]);
  });
  it("does not let plural tolerance cross distinct ingredients (oat vs oats stays put, no oil↔oils bleed)", () => {
    const got = inStep("Toast the oats", [mk("oats", "50g rolled oats"), mk("oil", "1 tbsp oil")]);
    expect(got.map((i) => i.id)).toEqual(["oats"]);
  });
});

describe("matchStep (drawer membership)", () => {
  const ingredients = [
    { id: "a", display_text: "2 cloves garlic", name: null },
    { id: "b", display_text: "1 tbsp olive oil", name: null },
    { id: "c", display_text: "200g chicken thighs", name: null },
  ];

  it("returns only the ingredients a step mentions, in ingredient order", () => {
    const got = inStep("Fry the garlic in the olive oil, then season", ingredients);
    expect(got.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("matches an ingredient by its head noun (chicken thighs → 'thighs')", () => {
    const got = inStep("Sear the thighs skin-side down", ingredients);
    expect(got.map((i) => i.id)).toEqual(["c"]);
  });

  it("returns nothing when a step names no ingredient", () => {
    expect(inStep("Simmer for 20 minutes", ingredients)).toHaveLength(0);
  });

  it("does not over-match a shared head noun (olive oil vs vegetable oil)", () => {
    const oils = [
      { id: "a", display_text: "1 tbsp olive oil", name: null },
      { id: "b", display_text: "2 tbsp vegetable oil", name: null },
    ];
    // "oil" is shared, so only the full-phrase match should win.
    const got = inStep("Heat the olive oil in a pan", oils);
    expect(got.map((i) => i.id)).toEqual(["a"]);
  });

  it("matches an ingredient written as 'X of Y' by its real noun", () => {
    const tin = [{ id: "t", display_text: "1 can of chopped tomatoes", name: null }];
    const got = inStep("Pour in the chopped tomatoes", tin);
    expect(got.map((i) => i.id)).toEqual(["t"]);
  });

  it("keeps prep words distinct (chopped vs diced tomatoes)", () => {
    const toms = [
      { id: "a", display_text: "400g chopped tomatoes", name: null },
      { id: "b", display_text: "400g diced tomatoes", name: null },
    ];
    const got = inStep("Add the chopped tomatoes", toms);
    expect(got.map((i) => i.id)).toEqual(["a"]);
  });

  it("does not surface a standalone ingredient that is a prefix of another (chili vs chili flakes)", () => {
    const chilis = [
      { id: "a", display_text: "1 chili", name: null },
      { id: "b", display_text: "1 tsp chili flakes", name: null },
    ];
    const got = inStep("Add the chili flakes and stir", chilis);
    expect(got.map((i) => i.id)).toEqual(["b"]);
  });
});
