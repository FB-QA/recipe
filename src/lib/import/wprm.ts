/**
 * WP Recipe Maker ingredient-group parser.
 *
 * schema.org/Recipe JSON-LD (`recipeIngredient`) is a flat list of strings with no
 * concept of sections, so the deterministic website path loses the "Sauce / Noodles
 * / Stir Fry" headings a recipe actually has. WP Recipe Maker — the dominant recipe
 * blog plugin (RecipeTineats and thousands of others) — keeps those sections in the
 * page HTML. This recovers them, deterministically and for free, so grouped recipes
 * stay grouped without an AI call.
 *
 * Keyed on the SPECIFIC `wprm-recipe-ingredient-group-name` class: the generic
 * `wprm-recipe-group-name` is shared with instruction groups ("Preparation:",
 * "Cooking:"), which must not leak into the ingredient list.
 */

import { decodeEntities, stripTags } from "./entities";

export interface WprmIngredientGroup {
  name: string | null;
  ingredients: string[];
}

/** Reassemble one ingredient from its amount/unit/name/notes spans, in order. */
function ingredientText(liInner: string): string {
  const parts: string[] = [];
  for (const cls of ["amount", "unit", "name", "notes"]) {
    const m = liInner.match(new RegExp(`wprm-recipe-ingredient-${cls}[^>]*>([\\s\\S]*?)</span>`, "i"));
    if (m) {
      const t = stripTags(m[1]);
      if (t) parts.push(t);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
}

/**
 * Bound parsing to ONE recipe's ingredient groups. A page can carry several WPRM
 * recipes (a related-recipe card, a print variant), each in its own
 * `wprm-recipe-ingredients-container`; without this, groups from a second card leak
 * into the first. Anchor on the first REAL ingredient-group (empty summary/print
 * containers may precede the main recipe, so keying on container position alone
 * fails), then stop at the next ingredients-container — which begins a different
 * recipe. Pages with no further container (e.g. test fixtures) run to the end.
 */
/** Collapse a recipe name to a comparison key: entity-decoded, alphanumerics only.
 *  So the JSON-LD title ("… - …", ASCII hyphen) matches WPRM's name ("… &ndash; …").
 *  Any entity `decodeEntities` didn't resolve is dropped whole, so a leftover named
 *  entity can't leak its letters (e.g. "ndash") into the key. */
const normName = (s: string): string =>
  decodeEntities(s)
    .replace(/&[a-z0-9]+;/gi, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/**
 * Bound parsing to the ingredient groups of the recipe `extractRecipeFromHtml`
 * selected, identified by its `title`. A page can carry several WPRM recipes (a
 * related-recipe card, a print variant), so the groups must be ASSOCIATED with the
 * chosen recipe, not just "the first ones on the page".
 *
 * Match the recipe by its `wprm-recipe-name` (normalised — the JSON-LD title and the
 * WPRM heading differ in punctuation), then anchor on the first real ingredient-group
 * AFTER that heading and stop at the next ingredients-container. If several distinct
 * recipes are present and none matches the title, return "" so the caller keeps the
 * flat list rather than staple the wrong ingredients on. With no name markup or a
 * single recipe (the common case, plus test fixtures), anchor on the first group.
 */
function scopeToRecipe(html: string, title: string | null): string {
  const names = [...html.matchAll(/wprm-recipe-name[^>]*>([^<]+)</gi)]
    .map((m) => ({ pos: m.index ?? 0, norm: normName(m[1]) }))
    .filter((n) => n.norm.length > 0);
  const distinct = new Set(names.map((n) => n.norm));

  let searchFrom = 0;
  if (title && names.length > 0) {
    const want = normName(title);
    const match = names.find((n) => n.norm === want);
    if (match) searchFrom = match.pos;
    else if (distinct.size > 1) return ""; // several recipes, none is the selected one → don't guess
    // else: a single recipe whose name didn't normalise-match — safe to use it
  }

  const rel = html.slice(searchFrom).search(/<div[^>]*class="[^"]*\bwprm-recipe-ingredient-group\b/i);
  if (rel === -1) return html;
  const from = searchFrom + rel;
  const after = html.slice(from);
  const nextContainer = after.slice(1).search(/wprm-recipe-ingredients-container/i);
  return nextContainer === -1 ? after : after.slice(0, nextContainer + 1);
}

/**
 * Parse WPRM ingredient groups out of a page's HTML, in document order. `title` is
 * the recipe `extractRecipeFromHtml` selected, used to associate the groups with the
 * right card on a multi-recipe page. Returns `null` when the page carries no WPRM
 * ingredient-group markup (the caller keeps the flat JSON-LD list). Groups with no
 * parsed ingredients are dropped.
 *
 * Every ingredient-group WRAPPER opens a fresh group, so an unnamed group that
 * follows a named one keeps its own boundary rather than merging into the previous
 * section. An ingredient-group heading names the group the wrapper just opened.
 */
export function parseWprmIngredientGroups(html: string, title: string | null = null): WprmIngredientGroup[] | null {
  if (!/wprm-recipe-ingredient-group\b/i.test(html)) return null;
  const scoped = scopeToRecipe(html, title);

  type Token = { pos: number; kind: "wrapper" | "name" | "ing"; text: string };
  const tokens: Token[] = [];

  // Group WRAPPER opens — a boundary even when the group has no heading.
  for (const m of scoped.matchAll(/<div[^>]*class="[^"]*\bwprm-recipe-ingredient-group\b[^"]*"[^>]*>/gi)) {
    tokens.push({ pos: m.index ?? 0, kind: "wrapper", text: "" });
  }
  // Group headings (specific class → excludes instruction groups).
  for (const m of scoped.matchAll(/wprm-recipe-ingredient-group-name[^>]*>([^<]*)</gi)) {
    tokens.push({ pos: m.index ?? 0, kind: "name", text: decodeEntities(m[1]).replace(/\s+/g, " ").trim() });
  }
  // Ingredient <li>s. Anchored to `<li` so the ingredient-name/-amount spans inside
  // don't match; the `\b` after "ingredient" keeps it off "-group" wrappers.
  for (const m of scoped.matchAll(/<li[^>]*class="[^"]*\bwprm-recipe-ingredient\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = ingredientText(m[1]);
    if (text) tokens.push({ pos: m.index ?? 0, kind: "ing", text });
  }

  tokens.sort((a, b) => a.pos - b.pos);

  const groups: WprmIngredientGroup[] = [];
  let current: WprmIngredientGroup | null = null;
  const ensure = (): WprmIngredientGroup => {
    if (!current) {
      current = { name: null, ingredients: [] };
      groups.push(current);
    }
    return current;
  };
  for (const t of tokens) {
    if (t.kind === "wrapper") {
      current = { name: null, ingredients: [] };
      groups.push(current);
    } else if (t.kind === "name") {
      ensure().name = t.text || null;
    } else {
      ensure().ingredients.push(t.text);
    }
  }

  const withIngredients = groups.filter((g) => g.ingredients.length > 0);
  return withIngredients.length > 0 ? withIngredients : null;
}
