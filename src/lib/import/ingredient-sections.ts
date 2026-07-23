import { stripTags } from "./entities";
import type { WprmIngredientGroup } from "./wprm";

/**
 * Generic (non-WPRM) ingredient-section recovery for server-rendered pages.
 *
 * schema.org/Recipe JSON-LD (`recipeIngredient`) is a flat list with no sections, so
 * a multi-component recipe ("Cake / Glaze", "For the chicken / For the rice") imports
 * as one undifferentiated group. WP Recipe Maker keeps its sections in bespoke markup
 * (`wprm.ts` recovers those); the wider web renders sections with the same GENERIC
 * shape — a short heading element immediately followed by a `<ul>`/`<ol>` of `<li>`s,
 * repeated per section. King Arthur (`div.ingredient-section > p` + `ul.list--bullets`)
 * and Serious Eats / Dotdash (`p.…__list-heading` + `ul.…__list`) both fit it.
 *
 * The safety contract is EXACT multiset equality against the flat schema.org list: we
 * emit sections only when the recovered `<li>`s are precisely the schema.org ingredients
 * — none added, dropped, or duplicated. schema.org is the count oracle (it stays flat),
 * so this both guards against grabbing a "You might also like" list AND scopes recovery
 * to the recipe `extractRecipeFromHtml` selected (a second card's different ingredients
 * cannot satisfy the equality). The emitted wording is the verbatim schema.org string —
 * identical to today's flat import, only grouped. Deterministic, zero-cost, no AI call.
 */

/** A heading element paired with the ingredient list that immediately follows it. */
interface Candidate {
  name: string;
  /** `<li>` texts, tags stripped and entities decoded. */
  items: string[];
}

/** A section heading is a SHORT label, not a paragraph or a bare number. */
const HEADING_MAX_WORDS = 12;
/** How far back from a `<ul>` a heading may sit (only whitespace/markup between them). */
const HEADING_LOOKBEHIND = 400;

/**
 * Comparison key aligning an HTML `<li>` with a schema.org ingredient string despite
 * inner markup (product `<a>` links), entities, and whitespace: tags stripped, entities
 * decoded (via {@link stripTags}), lowercased, reduced to letters and numbers.
 *
 * Uses the Unicode property classes (`\p{L}`/`\p{N}`) rather than `[a-z0-9]` so that
 * vulgar-fraction quantities stay DISTINCT — `½ cup cream` and `¼ cup cream` must not
 * both collapse to `cupcream`, or the multiset guard would accept a mismatched pair and
 * `emit` could place the wrong quantity in a section (½ ¼ etc. are `\p{N}`, kept).
 */
const matchKey = (s: string): string => stripTags(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** A multiset of match-keys → count, for exact-equality comparison. */
function keyCounts(items: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = matchKey(it);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function sameMultiset(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, n] of a) if (b.get(k) !== n) return false;
  return true;
}

/** Every `<li>`'s stripped text inside one list body, empties dropped. */
function listItems(listInner: string): string[] {
  const out: string[] = [];
  for (const m of listInner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const t = stripTags(m[1]);
    if (t) out.push(t);
  }
  return out;
}

/**
 * The heading that immediately precedes a list: the LAST short heading element in the
 * lookbehind window, provided only whitespace/markup (no visible text) sits between it
 * and the list. Returns null when there is no such heading (a bare list, e.g. nav).
 *
 * The window is first clipped to everything AFTER the previous list's close
 * (`</ul>`/`</ol>`/`</li>`), so inline markup INSIDE a prior list item — a `<strong>`
 * or `<span>` wrapping a whole ingredient — can never be mistaken for this list's
 * heading (which would fabricate sections for a flat recipe and regress AC3).
 */
function precedingHeading(pre: string): string | null {
  const lastClose = Math.max(
    pre.toLowerCase().lastIndexOf("</ul>"),
    pre.toLowerCase().lastIndexOf("</ol>"),
    pre.toLowerCase().lastIndexOf("</li>"),
  );
  if (lastClose !== -1) pre = pre.slice(lastClose + 5);
  let last: { text: string; end: number } | null = null;
  for (const m of pre.matchAll(/<(p|h[2-6]|strong|b|span|div)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = stripTags(m[2]);
    if (text) last = { text, end: (m.index ?? 0) + m[0].length };
  }
  if (!last) return null;
  // Only whitespace/markup may separate the heading from the list — otherwise the
  // "heading" is really body text that happens to precede a list.
  if (stripTags(pre.slice(last.end))) return null;
  const name = last.text.replace(/:\s*$/, "").trim();
  if (!name || /^\d+$/.test(name) || name.split(/\s+/).length > HEADING_MAX_WORDS) return null;
  return name;
}

/** All heading+list candidates on the page, in document order. */
function findCandidates(html: string): Candidate[] {
  const out: Candidate[] = [];
  for (const m of html.matchAll(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const items = listItems(m[2]);
    if (items.length === 0) continue;
    const start = m.index ?? 0;
    const name = precedingHeading(html.slice(Math.max(0, start - HEADING_LOOKBEHIND), start));
    if (name) out.push({ name, items });
  }
  return out;
}

/**
 * Recover named ingredient sections from generic server-rendered markup, or null.
 *
 * `flat` is the schema.org `recipeIngredient` list of the recipe already selected. We
 * emit the first contiguous run of ≥2 heading+list candidates whose combined `<li>`
 * multiset EXACTLY equals `flat` — that run is the recipe's own sectioned ingredients;
 * decoy lists and other recipe cards fail the equality and are excluded. Emitted
 * wording is the verbatim schema.org string (the fidelity contract), grouped by section.
 */
export function parseSectionedIngredientGroups(html: string, flat: string[]): WprmIngredientGroup[] | null {
  const flatCounts = keyCounts(flat);
  if (flatCounts.size === 0) return null;

  const candidates = findCandidates(html);

  // First contiguous window of ≥2 candidates whose combined multiset equals flat.
  for (let start = 0; start < candidates.length; start += 1) {
    let total = 0;
    for (let end = start; end < candidates.length; end += 1) {
      total += candidates[end].items.length;
      if (total > flat.length) break; // overshoot — no equality possible from `start`
      if (end - start < 1) continue; // need ≥2 sections
      const window = candidates.slice(start, end + 1);
      if (sameMultiset(keyCounts(window.flatMap((c) => c.items)), flatCounts)) {
        return emit(window, flat);
      }
    }
  }
  return null;
}

/**
 * Turn a matched window into groups whose ingredient wording is the verbatim schema.org
 * string (drawn from `flat` by match-key), so display text is identical to a flat import.
 */
function emit(window: Candidate[], flat: string[]): WprmIngredientGroup[] {
  const pool = new Map<string, string[]>();
  for (const s of flat) {
    const k = matchKey(s);
    if (!k) continue;
    (pool.get(k) ?? pool.set(k, []).get(k)!).push(s);
  }
  return window.map((c) => ({
    name: c.name,
    ingredients: c.items.map((it) => pool.get(matchKey(it))?.shift() ?? it),
  }));
}
