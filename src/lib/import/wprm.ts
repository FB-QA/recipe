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

export interface WprmIngredientGroup {
  name: string | null;
  ingredients: string[];
}

const AMP = /&amp;/g;
const decodeEntities = (s: string): string =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(AMP, "&");

const stripTags = (s: string): string => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

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
function scopeToFirstRecipe(html: string): string {
  const firstGroup = html.search(/<div[^>]*class="[^"]*\bwprm-recipe-ingredient-group\b/i);
  if (firstGroup === -1) return html;
  const after = html.slice(firstGroup);
  const nextContainer = after.slice(1).search(/wprm-recipe-ingredients-container/i);
  return nextContainer === -1 ? after : after.slice(0, nextContainer + 1);
}

/**
 * Parse WPRM ingredient groups out of a page's HTML, in document order. Returns
 * `null` when the page carries no WPRM ingredient-group markup (the caller then
 * keeps the flat JSON-LD list). Groups with no parsed ingredients are dropped.
 *
 * Every ingredient-group WRAPPER opens a fresh group, so an unnamed group that
 * follows a named one keeps its own boundary rather than merging into the previous
 * section. An ingredient-group heading names the group the wrapper just opened.
 */
export function parseWprmIngredientGroups(html: string): WprmIngredientGroup[] | null {
  if (!/wprm-recipe-ingredient-group\b/i.test(html)) return null;
  const scoped = scopeToFirstRecipe(html);

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
