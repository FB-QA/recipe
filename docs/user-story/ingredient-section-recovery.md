---
slug: ingredient-section-recovery
project: recipe
type: user-story
created: 2026-07-23
status: shaped-not-built
shape: compute
links: [lib/import/wprm.ts, lib/import/jsonld.ts, lib/import/schema.ts]
---

# Ingredient section recovery for non-WPRM sites (deterministic, no AI)

## Story (Tara)

As a **Cookdex cook**, I want **an imported recipe to keep its ingredient
sections ("Cake / Glaze", "For the sauce / For the chicken")** so that **a
multi-component recipe reads as its parts, not one undifferentiated list**.

Today only **WP Recipe Maker** blogs keep their sections (`lib/import/wprm.ts`
recovers them from HTML). Server-rendered non-WPRM sites — King Arthur, Serious
Eats and the whole Dotdash Meredith network (Simply Recipes, Allrecipes, The
Spruce Eats, Food & Wine) — expose only a **flat** schema.org `recipeIngredient`
array, so everything lands in one unnamed group. The AI/caption path (Instagram
→ `schema.ts` `ingredientGroups[]`) already handles sections; this story closes
the deterministic web path for non-WPRM sites **without an AI call**.

## The evidence (gathered 2026-07-23)

Two unrelated platforms server-render sections with the **same structure** —
a heading element immediately followed by a `<ul>` of ingredient `<li>`s,
repeated per section. Only the class names differ:

| Site | Section heading | Ingredient list |
|---|---|---|
| King Arthur | `div.ingredient-section > p` (e.g. "Glaze") | `ul.list--bullets > li` |
| Serious Eats (Dotdash) | `p.mm-recipes-structured-ingredients__list-heading` ("For the chicken:") | `ul.mm-recipes-structured-ingredients__list > li` |

Both are in the **server HTML** (verified: KA via curl; Serious Eats via the
raw 484 KB response read from the page origin — `…__list-heading` appears once
per section). schema.org stays flat on both, so it is the count oracle, not the
section source.

### The parse-vs-fetch split (this shaped the scope)

- **Parsing is the easy, certain half.** The generic heading+list heuristic
  below handles KA and Serious Eats from one code path.
- **Fetching is the real blocker for Dotdash sites.** The importer fetches with
  a plain browser-UA request (`resolvers/website.ts`, `BROWSER_USER_AGENT`).
  King Arthur has no bot-filter → the parser ships a win there immediately.
  Serious Eats' edge rejects the plain fetch (a real browser gets 484 KB; the
  server-side fetch gets a ~600-byte challenge). So Dotdash sections need the
  fetch solved first — a **separate spike (Part B)**, not part of this story's
  certainty.

## Where to build it (how + where)

1. **New parser module** `src/lib/import/ingredient-sections.ts` — mirrors the
   shape of `wprm.ts`. Given the page HTML + the flat schema.org ingredient
   list, return named sections or null.
   - Find candidate blocks: a short heading element (`<p>`, `<h2>`–`<h6>`, or
     `<strong>`; or a class matching `/ingredient.*(section|heading)|list-heading/i`)
     immediately followed by a `<ul>`/`<ol>` whose `<li>` texts match schema.org
     ingredient strings.
   - Emit sections **only when** ≥2 headed lists exist **and** their combined
     `<li>` set equals the flat schema.org `recipeIngredient` set (the same
     "total === flat" safety check `jsonld.ts` already applies to WPRM). This is
     the guard against grabbing a "You might also like" list.
   - Heading text → group name; strip a trailing colon ("For the chicken:" →
     "For the chicken").
2. **Wire into** `src/lib/import/jsonld.ts` group recovery (see its §117-146
   comment): try WPRM first (unchanged); if WPRM yields nothing, try this new
   parser; else fall back to one unnamed group (today's behaviour).
3. **Tests** — capture the two real pages as fixtures (KA almond bundt cake;
   Serious Eats Halal Cart chicken — 4 sections). Verify: KA → Cake/Glaze;
   Serious Eats → For the chicken/rice/sauce/To serve; a flat single-list recipe
   → one unnamed group; a page with a decoy related-recipe `<ul>` → not grouped
   (schema cross-check rejects it). Falsify: mismatched counts → single group.

## Acceptance criteria

- **AC1** — A server-rendered recipe with sectioned ingredients (KA "Cake/Glaze")
  imports with those named groups, not one flat list.
- **AC2** — The recovered ingredients are EXACTLY the schema.org set — none
  added, dropped or duplicated (the total-match guard holds).
- **AC3** — A flat recipe (no sub-headings) still imports as one unnamed group;
  no false sections.
- **AC4** — A page with unrelated `<ul>` lists (related recipes, notes) does not
  produce spurious groups.
- **AC5** — WPRM sites are unaffected (WPRM path still wins first).
- **AC6** — No AI call on this path; fully deterministic.

## Out of scope (the cut)

- **The Serious Eats / Dotdash FETCH** — getting past the edge bot-filter. Cheap
  spike first (add a complete browser header set to the importer fetch and
  re-test); if it fails, those sites stay on the AI resolver or need a headless
  fetch — a separate, bigger call. **This story delivers King Arthur-class sites
  now and is ready for Dotdash the moment the fetch works.**
- **NYT Cooking** — subscription-gated; the free fetch returns a wall page with
  no ingredient data. Out until the fetch/access is solved.
- Any change to the AI/caption path (already handles sections).
- Instruction/step section recovery (schema.org HowToSection is already handled
  in `jsonld.ts`).

## Verification (test-first)

Unit layer, both intents. Fixtures = the two captured HTML pages. Verify routes
each AC to the parser output; falsify attacks it with count mismatches, decoy
lists, and a WPRM page (must not double-parse). Solo, all hats.
