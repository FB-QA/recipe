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

  it("does not let plural tolerance defeat the shared-noun guard (onion vs spring onions)", () => {
    // "onion" and "spring onions" share the noun once plurals are folded; the step
    // names spring onions in full, so plain onion must NOT ride along on "onions".
    const got = inStep("Scatter the spring onions on top", [mk("onion", "1 onion, diced"), mk("spring", "3 spring onions")]);
    expect(got.map((i) => i.id)).toEqual(["spring"]);
  });

  it("does not let a plural head-noun cross-match a singular sibling (green beans vs vanilla bean)", () => {
    const got = inStep("Steam the green beans until tender", [mk("green", "400g green beans"), mk("van", "1 vanilla bean, split")]);
    expect(got.map((i) => i.id)).toEqual(["green"]);
  });

  it("still shows the plain single-word ingredient when a qualified sibling is not referenced (milk vs almond milk)", () => {
    // "the milk" names milk alone; almond milk is not referenced, so the guard must
    // not suppress plain milk (regression guard for the shared-noun fix).
    const got = inStep("Warm the milk gently", [mk("milk", "200ml milk"), mk("almond", "100ml almond milk")]);
    expect(got.map((i) => i.id)).toEqual(["milk"]);
  });

  it("keeps both when a bare noun and a same-stem sibling are each quoted (eggs and egg whites)", () => {
    // The step names BOTH; "eggs" is a leading-word coincidence with "egg whites",
    // not a redundant sub-match, so positional containment must keep both.
    const got = inStep("Beat the eggs, then fold in the egg whites", [mk("e", "2 eggs"), mk("w", "3 egg whites")]);
    expect(got.map((i) => i.id)).toEqual(["e", "w"]);
  });

  it("keeps both for peas / pea shoots and oats / oat milk when each is quoted", () => {
    expect(inStep("Stir in the peas and the pea shoots", [mk("p", "200g peas"), mk("s", "handful pea shoots")]).map((i) => i.id)).toEqual(["p", "s"]);
    expect(inStep("Combine the oats with the oat milk", [mk("o", "50g oats"), mk("m", "200ml oat milk")]).map((i) => i.id)).toEqual(["o", "m"]);
  });

  it("keeps a bare noun quoted standalone even when the phrase comes FIRST (cream cheese … then the cream)", () => {
    // The bare noun's first occurrence is inside the phrase; it must still survive
    // on the strength of its later standalone occurrence.
    const rows = [mk("cream", "200ml double cream"), mk("cc", "300g cream cheese")];
    expect(inStep("Beat the cream cheese, then whip the cream until stiff", rows).map((i) => i.id).sort()).toEqual(["cc", "cream"]);
  });

  it("still drops the bare noun when it ONLY appears inside the phrase (spring onions, no standalone onion)", () => {
    const rows = [mk("onion", "1 onion"), mk("spring", "3 spring onions")];
    expect(inStep("Fry the spring onions gently", rows).map((i) => i.id)).toEqual(["spring"]);
  });
});

describe("matchStep — review round 3 (plural stems, plural-blind collision, of-compounds)", () => {
  const mk = (id: string, text: string) => ({ id, display_text: text, name: text });
  it("matches an -ie plural to its singular (cookies → cookie)", () => {
    expect(inStep("Crush each cookie into crumbs", [mk("c", "12 cookies")]).map((i) => i.id)).toEqual(["c"]);
  });
  it("resolves a prefix collision across a plural difference (canned tomatoes vs canned tomato paste)", () => {
    const rows = [mk("tom", "400g canned tomatoes"), mk("paste", "2 tbsp canned tomato paste")];
    expect(inStep("Add the canned tomatoes and simmer", rows).map((i) => i.id)).toEqual(["tom"]);
  });
  it("does not let a bare ingredient claim the head of an 'X of Y' compound (double cream vs cream of tartar)", () => {
    const rows = [mk("whites", "4 egg whites"), mk("tartar", "1 tsp cream of tartar"), mk("cream", "300ml double cream")];
    const got = inStep("Whisk the egg whites, then add the cream of tartar", rows).map((i) => i.id).sort();
    expect(got).toEqual(["tartar", "whites"]);
  });
  it("still matches a bare ingredient quoted standalone elsewhere in an of-compound step", () => {
    const rows = [mk("tartar", "1 tsp cream of tartar"), mk("cream", "300ml double cream")];
    // cream appears both inside "cream of tartar" (excluded) and standalone (kept)
    expect(inStep("Add the cream of tartar, then fold in the cream", rows).map((i) => i.id).sort()).toEqual(["cream", "tartar"]);
  });

  it("does not let an unrelated distant 'powder' vouch for coconut milk powder", () => {
    // The shortened "coconut milk" hit for the powder collides with plain coconut
    // milk; the leftover word "powder" appears only far away (cocoa powder), so it
    // must not rescue the powder row.
    const rows = [mk("milk", "1 can coconut milk"), mk("powder", "2 tbsp coconut milk powder"), mk("cocoa", "1 tbsp cocoa powder")];
    const got = inStep("Stir in the coconut milk, then dust with cocoa powder", rows).map((i) => i.id).sort();
    expect(got).toEqual(["cocoa", "milk"]);
  });

  it("keeps a sole ingredient followed by ordinary 'of' prose (drain the pasta of water)", () => {
    // "pasta of excess water" is prose, not an X-of-Y compound — nothing else owns
    // "excess"/"water", so pasta must survive.
    expect(inStep("Drain the pasta of excess water before serving", [mk("p", "200g pasta")]).map((i) => i.id)).toEqual(["p"]);
  });

  it("blocks a bare -ie noun shared by two rows (a cookie vs cookies)", () => {
    // canonicalNoun must agree with wordVariants: cookie and cookies share a head,
    // so a step naming just "a cookie" resolves neither (ambiguous), not both.
    const rows = [mk("one", "1 raspberry cookie"), mk("many", "200g chocolate cookies")];
    expect(inStep("Top with a cookie", rows)).toHaveLength(0);
  });
});

describe("matchStep — leading vs trailing qualifiers", () => {
  const mk = (id: string, text: string) => ({ id, display_text: text, name: text });
  it("keeps a LEADING qualifier distinct (fresh berries vs frozen berries)", () => {
    const rows = [mk("fresh", "200g fresh berries"), mk("frozen", "200g frozen berries")];
    expect(inStep("Fold in the frozen berries", rows).map((i) => i.id)).toEqual(["frozen"]);
    expect(inStep("Top with the fresh berries", rows).map((i) => i.id)).toEqual(["fresh"]);
  });
  it("still strips a TRAILING qualifier (mixed berries fresh or frozen → berries)", () => {
    const rows = [mk("b", "1 cup mixed berries fresh or frozen")];
    expect(inStep("Blend the berries until smooth", rows).map((i) => i.id)).toEqual(["b"]);
    expect(inStep("Freeze until frozen solid", rows).map((i) => i.id)).toEqual([]);
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

describe("matchStep — 'A or B' alternatives and trailing prep (HBH red curry beef noodles)", () => {
  const mk = (id: string, text: string) => ({ id, display_text: text, name: text });
  it("matches an 'A or B' ingredient by EITHER name (tamari or soy sauce)", () => {
    const rows = [mk("t", "1/3 cup tamari or soy sauce")];
    expect(inStep("Stir in the tamari", rows).map((i) => i.id)).toEqual(["t"]);
    expect(inStep("Add the soy sauce", rows).map((i) => i.id)).toEqual(["t"]);
  });
  it("shows the alternative ingredient once, not once per alternative", () => {
    // A step naming both alternatives must not duplicate the row.
    const rows = [mk("t", "1/3 cup tamari or soy sauce")];
    expect(inStep("Add tamari or soy sauce to taste", rows)).toHaveLength(1);
  });
  it("strips a trailing prep word so 'roasted salted cashews chopped' matches 'cashews'", () => {
    // The "(chopped)" parenthetical flattened on import; a LEADING prep word stays.
    expect(inStep("Top with the cashews", [mk("c", "1/2 cup roasted salted cashews chopped")]).map((i) => i.id)).toEqual(["c"]);
  });
  it("does not mistake a 'fresh or frozen' qualifier tail for two alternatives", () => {
    // Regression guard: "or" joining qualifiers is a tail to strip, not a split, so
    // "frozen" must not become a matchable alternative that a freezing step catches.
    const rows = [mk("b", "1 cup mixed berries fresh or frozen")];
    expect(inStep("Freeze until frozen solid", rows)).toHaveLength(0);
    expect(inStep("Blend the berries", rows).map((i) => i.id)).toEqual(["b"]);
  });
  it("keeps a leading prep adjective distinct (chopped vs diced tomatoes)", () => {
    const rows = [mk("c", "400g chopped tomatoes"), mk("d", "400g diced tomatoes")];
    expect(inStep("Add the diced tomatoes", rows).map((i) => i.id)).toEqual(["d"]);
  });
});

describe("matchStep — 'A and B' combinations and shared specific nouns", () => {
  const mk = (id: string, text: string) => ({ id, display_text: text, name: text });
  it("surfaces a combination row in a step naming EITHER part (basil and cilantro)", () => {
    const rows = [mk("mix", "1 cup mixed Thai basil and cilantro")];
    expect(inStep("Stir through the basil", rows).map((i) => i.id)).toEqual(["mix"]);
    expect(inStep("Fold in the cilantro", rows).map((i) => i.id)).toEqual(["mix"]);
    expect(inStep("Combine the basil and cilantro", rows).map((i) => i.id)).toEqual(["mix"]);
  });
  it("puts a combination in the respective drawer when parts fall in different steps", () => {
    const rows = [mk("mix", "1 cup basil and cilantro")];
    expect(inStep("Bruise the basil in a mortar", rows).map((i) => i.id)).toEqual(["mix"]);
    expect(inStep("Scatter the cilantro to serve", rows).map((i) => i.id)).toEqual(["mix"]);
  });
  it("shows two rows that share a specific noun when both genuinely are it (combo + standalone cilantro)", () => {
    const rows = [mk("mix", "1 cup basil and cilantro"), mk("cil", "1/4 cup chopped fresh cilantro")];
    expect(inStep("Stir in the cilantro", rows).map((i) => i.id).sort()).toEqual(["cil", "mix"]);
  });
  it("still does NOT pull a defining-modifier sibling in on a bare noun (spring onions vs onion)", () => {
    const rows = [mk("o", "1 onion"), mk("s", "3 spring onions")];
    expect(inStep("Add the diced onion", rows).map((i) => i.id)).toEqual(["o"]);
  });
});

describe("matchStep — review round: idiomatic 'and', or-elision, prep-contested heads", () => {
  const mk = (id: string, text: string) => ({ id, display_text: text, name: text });
  it("does not split an idiomatic 'and' compound name (bread and butter pickles)", () => {
    const rows = [mk("p", "1 cup bread and butter pickles")];
    expect(inStep("Toast the bread until golden", rows)).toHaveLength(0);
    expect(inStep("Chop the pickles finely", rows).map((i) => i.id)).toEqual(["p"]);
  });
  it("does not split 'sweet and sour sauce' either (noun follows the 'and')", () => {
    const rows = [mk("s", "1/2 cup sweet and sour sauce")];
    expect(inStep("Add a little sweet paprika", rows)).toHaveLength(0);
    expect(inStep("Spoon over the sauce", rows).map((i) => i.id)).toEqual(["s"]);
  });
  it("still splits a genuine 'and' list joining the final word (salt and pepper)", () => {
    expect(inStep("Season with salt", [mk("sp", "salt and pepper")]).map((i) => i.id)).toEqual(["sp"]);
    expect(inStep("Add a grind of pepper", [mk("sp", "salt and pepper")]).map((i) => i.id)).toEqual(["sp"]);
  });
  it("does not let an elided 'or' adjective match a bare mention (red or white wine vs red onion)", () => {
    const rows = [mk("wine", "1 cup red or white wine"), mk("onion", "1 red onion")];
    expect(inStep("Dice the red onion", rows).map((i) => i.id)).toEqual(["onion"]);
    expect(inStep("Deglaze with the wine", rows).map((i) => i.id)).toEqual(["wine"]);
  });
  it("does not filter a whole single-word ingredient that shares a stem with a modifier (peas vs pea shoots)", () => {
    const rows = [mk("p", "200g peas"), mk("s", "handful pea shoots")];
    expect(inStep("Stir in the peas and the pea shoots", rows).map((i) => i.id).sort()).toEqual(["p", "s"]);
  });
  it("resolves neither for a bare noun when prep variants contest it (chopped vs diced tomatoes)", () => {
    const rows = [mk("c", "400g chopped tomatoes"), mk("d", "400g diced tomatoes")];
    expect(inStep("Add the tomatoes and simmer", rows)).toHaveLength(0);
    expect(inStep("Add the chopped tomatoes", rows).map((i) => i.id)).toEqual(["c"]);
  });
});
