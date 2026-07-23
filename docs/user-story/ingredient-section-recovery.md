---
slug: ingredient-section-recovery
project: recipe
type: user-story
created: 2026-07-23
status: part-a-built
shape: compute
links: [lib/import/wprm.ts, lib/import/jsonld.ts, lib/import/schema.ts, lib/import/ingredient-sections.ts]
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
  Serious Eats' edge rejects the server-side fetch (a real browser gets 484 KB;
  the server-side fetch gets a ~600-byte block). So Dotdash sections need the
  fetch solved first — a **separate spike (Part B)**, not part of this story's
  certainty.

  **Part B spike result (2026-07-23): header enrichment does NOT work.** Adding a
  full browser header set (Accept-Language, Sec-Fetch-\*, sec-ch-ua, Upgrade-
  Insecure-Requests, `--compressed`) to the server-side fetch returns the SAME
  `HTTP 402`, 612 bytes as the plain fetch. The body is a People Inc (Dotdash's
  parent) access-block page inviting `support@people.inc` / `contentlicensing@
  people.inc` — an **IP-level block on datacentre ranges**, not a header or JS
  challenge. So Dotdash needs a headless/residential-origin fetch or a licensing
  arrangement — a bigger call, firmly out of this story. Part A's parser is proven
  against Serious Eats' real markup (fixture) so sections light up the moment the
  fetch is solved.

## Where to build it (how + where) — BUILT (Part A)

1. **New parser module** `src/lib/import/ingredient-sections.ts` — mirrors the
   shape of `wprm.ts`. Given the page HTML + the flat schema.org ingredient
   list, returns named sections or null. `parseSectionedIngredientGroups(html, flat)`.
   - Finds candidate blocks: a short heading element (`<p>`, `<h2>`–`<h6>`,
     `<strong>`, `<b>`, or a `<span>`/`<div>`) that immediately precedes a
     `<ul>`/`<ol>` — nothing but whitespace/markup between them, heading ≤12
     words and not a bare number. `<li>` inner tags (product `<a>` links) are
     stripped before comparison.
   - Emits sections **only when** a contiguous run of ≥2 headed lists exists
     **and** their combined `<li>` list is an EXACT **multiset** match to the
     flat schema.org `recipeIngredient` list — count-equal, not set-equal, so a
     repeated ingredient ("salt" ×2 vs ×3) is caught, not silently accepted.
   - This exact-multiset guard is **deliberately STRICTER** than the WPRM path's
     check. The WPRM guard in `buildIngredientGroups` is a *fuzzy* bound
     (`total` within 0.5×–1.4× of `flat.length`) because WPRM's own scrape can
     diverge slightly from the JSON-LD. A from-scratch DOM parser gets no such
     benefit of the doubt: exact equality is what makes it safe.
   - The exact-multiset match is also the **recipe-scoping mechanism**. WPRM
     scopes by its `wprm-recipe-name` markup (`scopeToRecipe`); King Arthur /
     Serious Eats have no equivalent, so scoping falls to the count oracle — a
     second recipe card's *different* ingredients cannot satisfy equality with
     the selected recipe's flat list, so its sections are excluded. (A decoy card
     with a byte-identical ingredient multiset is a documented residual edge; not
     seen in the wild.)
   - Heading text → group name; strips a trailing colon ("For the chicken:" →
     "For the chicken"). Emitted wording is the **verbatim schema.org string**
     (drawn from `flat` by match-key) — identical to today's flat import, grouped.
2. **Wired into** `src/lib/import/jsonld.ts` `buildIngredientGroups` (the real
   group-recovery function): WPRM tried first (unchanged); if WPRM yields no named
   sections, the generic parser is tried; else fall back to one unnamed group
   (today's behaviour). Group `temporaryId` is `sec-g*` for provenance.
3. **Tests** — `ingredient-sections.test.ts` (parser unit, 10 cases) +
   `jsonld.test.ts` (integration). Fixture = the **real captured** King Arthur
   "Glazed Lemon Bundt Cake" HTML (`__fixtures__/king-arthur-lemon-bundt.html`:
   Cake / Glaze / Icing, product `<a>` links, footnote `<p>`). Verified: KA →
   three named groups verbatim; multiset duplicates accepted when matched, rejected
   when over-count; flat recipe → one unnamed group (AC3); decoy related-recipe
   list ignored (AC4); two recipe cards → only the selected recipe's flat list
   matches (scoping); WPRM page unaffected (AC5).

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

- **The Serious Eats / Dotdash FETCH** — getting past the edge block. The cheap
  spike (fuller browser header set) was **tried and failed** (HTTP 402, IP-level
  block — see the Part B result above); those sites need a headless/residential
  fetch or a licensing deal, a separate bigger call. Note the **real** user
  fallback when the website fetch fails is **paste/manual**, NOT an AI resolver:
  `buildResolverChain` registers only `websiteResolver` for `sourceKind ===
  "website"` (`registry.ts:42-44`), so a blocked fetch exhausts the chain and the
  engine renders the paste-text path — there is no website→AI rung to fall back to.
  **This story delivers King Arthur-class sites now and is ready for Dotdash the
  moment the fetch is solved.**
- **NYT Cooking** — subscription-gated; the free fetch returns a wall page with
  no ingredient data. Out until the fetch/access is solved.
- Any change to the AI/caption path (already handles sections).
- Instruction/step section recovery (schema.org HowToSection is already handled
  in `jsonld.ts`).

## Verification (test-first)

Unit layer, both intents. Fixtures = the two captured HTML pages. Verify routes
each AC to the parser output; falsify attacks it with count mismatches, decoy
lists, and a WPRM page (must not double-parse). Solo, all hats.
