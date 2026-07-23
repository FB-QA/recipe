import { decodeEntities } from "./entities";
import type { AiExtractedRecipe, ExtractedIngredient, ExtractedNutrition, ExtractedRecipeStep } from "./schema";
import { parseWprmIngredientGroups } from "./wprm";

type IngredientGroup = AiExtractedRecipe["ingredientGroups"][number];

/**
 * schema.org/Recipe JSON-LD parser — the deterministic, zero-cost rung of the
 * website flow (§11, AC1). v1 asset extended to produce the v2 §18 shape:
 * verbatim ingredient wording, one unnamed group for sectionless recipes,
 * ordered steps, nulls for absent data — never invented values.
 */

/** "PT1H30M" / "PT20M" → minutes. Null for unparseable input. */
export function durationToMinutes(iso: string | null | undefined): number | null {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m || (!m[1] && !m[2])) return null;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function firstString(v: unknown): string | null {
  // Decode HTML entities the page encoded inside its JSON-LD ("don&#39;t" → "don't",
  // "AT&amp;T" → "AT&T"); this is the chokepoint for title, description, nutrition
  // and HowToStep text. Correct for image URLs too (`&amp;` → `&`).
  if (typeof v === "string") return decodeEntities(v).trim() || null;
  if (Array.isArray(v)) {
    for (const item of v) {
      const s = firstString(item);
      if (s) return s;
    }
  }
  if (v && typeof v === "object" && "url" in v) return firstString((v as { url: unknown }).url);
  return null;
}

type JsonLdNode = Record<string, unknown>;

// Depth cap on @graph recursion: a hostile page can nest {"@graph":{"@graph":…}}
// arbitrarily deep and, unbounded, blow the stack with a RangeError that escapes
// the resolver's failure envelope. Real recipe graphs are shallow.
const MAX_GRAPH_DEPTH = 32;

function findRecipeNode(json: unknown, depth = 0): JsonLdNode | null {
  if (depth > MAX_GRAPH_DEPTH) return null;
  const nodes: unknown[] = Array.isArray(json) ? json : [json];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const obj = node as JsonLdNode;
    if (obj["@graph"]) {
      const nested = findRecipeNode(obj["@graph"], depth + 1);
      if (nested) return nested;
    }
    const type = obj["@type"];
    const types = asArray(type).map((t) => String(t).toLowerCase());
    if (types.includes("recipe")) return obj;
  }
  return null;
}

/**
 * A "N." is a list marker only when it opens a clause: it sits at the very start
 * of the text, hugs the previous sentence's end (WP Recipe Maker concatenates
 * "…set aside.2. Heat…"), or follows a heading colon ("Directions: 1. …"),
 * possibly across spaces or a line break. A number that follows a WORD — "as in
 * step 1.", "roast for 1. 5 hours" — is prose, not a marker, and must never
 * trigger a split. `at` is the index of the digit.
 */
function isEnumerationMarker(text: string, at: number): boolean {
  let j = at - 1;
  while (j >= 0 && (text[j] === " " || text[j] === "\t")) j -= 1;
  return j < 0 || ".!?:\n".includes(text[j]);
}

/**
 * Split a method blob that runs its steps together with "1." "2." … markers into
 * one string per step. WP Recipe Maker (halfbakedharvest.com and others) can emit
 * the ENTIRE method as a single HowToStep with no line breaks; left whole, every
 * step imports as one. Only a run of clause-opening markers (see
 * {@link isEnumerationMarker}) that reads 1, 2, 3… is treated as an enumeration —
 * a lone number, an out-of-sequence one, a decimal/temperature ("375.", "1.5"),
 * or a step cross-reference in prose is left untouched, so genuine prose (even
 * with in-sequence numbers) is never chopped. Returns null when there is no run.
 */
function splitEnumeratedSteps(text: string): string[] | null {
  const marks: { num: number; at: number; len: number }[] = [];
  for (const m of text.matchAll(/(\d+)\.\s+/g)) marks.push({ num: Number(m[1]), at: m.index ?? 0, len: m[0].length });
  // Take the longest run of clause-opening markers that reads 1, 2, 3… from the
  // start, stopping at the FIRST break. This rejects an out-of-order run like
  // "1. … 3. … 2." (which would embed one step inside another) while tolerating a
  // trailing restart — a numbered notes block after the method rides on the last
  // step rather than defeating the split.
  const anchored = marks.filter((mk) => isEnumerationMarker(text, mk.at));
  const seq: typeof anchored = [];
  for (const mk of anchored) {
    if (mk.num !== seq.length + 1) break;
    seq.push(mk);
  }
  if (seq.length < 2) return null;
  // What broke the run decides whether to split. A restart at 1 is a fresh list
  // (a numbered notes block after the method) — split the prefix and let it ride
  // on the last step. Any OTHER continuation ("1, 2, 4" or a stray "425.") means
  // a single malformed enumeration; leave it whole rather than cram an orphaned
  // step onto another.
  const breaker = anchored[seq.length];
  if (breaker && breaker.num !== 1) return null;
  const parts: string[] = [];
  // Any text before the first marker is real content (a lead-in sentence, not a
  // step number) — keep it on step one rather than silently dropping it.
  const lead = text.slice(0, seq[0].at).trim();
  for (let i = 0; i < seq.length; i += 1) {
    const start = seq[i].at + seq[i].len;
    const end = i + 1 < seq.length ? seq[i + 1].at : text.length;
    let part = text.slice(start, end).trim();
    if (i === 0 && lead) part = part ? `${lead} ${part}` : lead;
    if (part) parts.push(part);
  }
  return parts.length >= 2 ? parts : null;
}

/** One instruction string → one or more step strings: a numbered run first, else
 *  newline-separated lines (some sites cram every step into one string), else the
 *  string itself. */
function expandInstruction(text: string): string[] {
  return (
    splitEnumeratedSteps(text) ??
    text
      .split(/\r?\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function mapInstructions(raw: unknown): string[] {
  const out: string[] = [];
  for (const item of asArray(raw)) {
    if (typeof item === "string") {
      // A raw string instruction skips firstString, so decode entities here; the
      // object path below goes through firstString, which already decodes.
      expandInstruction(decodeEntities(item)).forEach((s) => out.push(s));
    } else if (item && typeof item === "object") {
      const obj = item as JsonLdNode;
      if (obj["@type"] && String(obj["@type"]).toLowerCase() === "howtosection") {
        mapInstructions(obj.itemListElement).forEach((s) => out.push(s));
      } else {
        const text = firstString(obj.text) ?? firstString(obj.name);
        if (text) expandInstruction(text).forEach((s) => out.push(s));
      }
    }
  }
  return out;
}

function jsonLdScripts(html: string): unknown[] {
  const out: unknown[] = [];
  const scripts = [
    ...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
  for (const match of scripts) {
    try {
      out.push(JSON.parse(match[1].trim()));
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * recipeYield to a display string. Schema.org allows a number (`2`), a string
 * ("Serves 4"), or an array (["4", "4 servings"]) — a bare number is common and
 * was previously dropped. Returns null only when genuinely absent.
 */
function yieldText(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return firstString(raw);
}

/** First number in a yield string ("2 servings" → 2); null when absent. */
function yieldValue(text: string | null): number | null {
  const m = text?.match(/\d+/);
  return m ? Number(m[0]) : null;
}

/**
 * Ingredient sections for the deterministic path. schema.org has none, so we recover
 * WP Recipe Maker's groups from the HTML when present; otherwise everything goes in
 * one unnamed group. WPRM is trusted only when it carries at least one NAMED section
 * and its ingredient count is close to the JSON-LD list's — a wildly different count
 * means a bad parse, so we fall back rather than ship garbage.
 */
function buildIngredientGroups(html: string, flat: string[], title: string): IngredientGroup[] {
  const wprm = parseWprmIngredientGroups(html, title);
  if (wprm && wprm.some((g) => g.name)) {
    const total = wprm.reduce((n, g) => n + g.ingredients.length, 0);
    // Lower bound floors at 1, not 2 — a valid one-ingredient recipe in a named
    // section (total === flat === 1) is an exact match, not a suspicious parse.
    const lo = Math.max(1, Math.floor(flat.length * 0.5));
    // Upper bound below 2× so a second same-sized recipe card's ingredients (which
    // would double the count) is rejected rather than silently merged in.
    if (total >= lo && total <= Math.ceil(flat.length * 1.4)) {
      let position = 0;
      return wprm.map((g, gi) => ({
        temporaryId: `wprm-g${gi}`,
        name: g.name,
        position: gi,
        optional: false,
        ingredients: g.ingredients.map((t) => toIngredient(t, position++)),
      }));
    }
  }
  return [
    {
      temporaryId: "jsonld-g0",
      name: null, // single unnamed group: renders no heading (§18)
      position: 0,
      optional: false,
      ingredients: flat.map(toIngredient),
    },
  ];
}

function toIngredient(displayText: string, position: number): ExtractedIngredient {
  return {
    temporaryId: `jsonld-i${position}`,
    position,
    originalText: displayText, // verbatim wording — the fidelity contract
    quantityText: null,
    quantityValue: null,
    quantityMin: null,
    quantityMax: null,
    unit: null,
    name: displayText,
    preparation: null,
    optional: false,
    alternativeGroupId: null,
  };
}

/** schema.org NutritionInformation → our nutrition shape; null when absent. */
function extractNutrition(raw: unknown): ExtractedNutrition | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as JsonLdNode;
  const calories = firstString(n.calories);
  const protein = firstString(n.proteinContent);
  const carbs = firstString(n.carbohydrateContent);
  const fat = firstString(n.fatContent);
  const fibre = firstString(n.fiberContent);
  const sugar = firstString(n.sugarContent);
  if (!calories && !protein && !carbs && !fat && !fibre && !sugar) return null;
  return { calories, protein, carbs, fat, fibre, sugar, perServing: true };
}

/**
 * Parse schema.org/Recipe JSON-LD out of a page's HTML into the v2 shape.
 * Null unless the recipe is usable (non-empty title, ≥1 ingredient, ≥1 step) —
 * the §11 "skip AI entirely" bar; missing servings/times never force an AI call.
 */
export function extractRecipeFromHtml(html: string): AiExtractedRecipe | null {
  for (const json of jsonLdScripts(html)) {
    const node = findRecipeNode(json);
    if (!node) continue;

    const title = firstString(node.name);
    const ingredients = asArray(node.recipeIngredient)
      .map((i) => (typeof i === "string" ? decodeEntities(i).trim() : ""))
      .filter(Boolean);
    const instructions = mapInstructions(node.recipeInstructions);

    if (!title || ingredients.length === 0 || instructions.length === 0) continue;

    const servingsText = yieldText(node.recipeYield);
    const nutrition = extractNutrition(node.nutrition);
    const steps: ExtractedRecipeStep[] = instructions.map((instruction, position) => ({
      position,
      title: null,
      instruction,
      ingredientGroupReferences: [],
    }));

    return {
      extractionStatus: "recipe",
      title,
      description: firstString(node.description),
      servings: { value: yieldValue(servingsText), originalText: servingsText },
      nutrition,
      prepTimeMinutes: durationToMinutes(firstString(node.prepTime)),
      cookTimeMinutes: durationToMinutes(firstString(node.cookTime)),
      totalTimeMinutes: durationToMinutes(firstString(node.totalTime)),
      ingredientGroups: buildIngredientGroups(html, ingredients, title),
      steps,
      tips: [],
      servingSuggestions: [],
      warnings: [],
      missingFields: [],
    };
  }
  return null;
}

/** The recipe's image URL, when the JSON-LD carries one (cover use, next story). */
export function jsonLdImageUrl(html: string): string | null {
  for (const json of jsonLdScripts(html)) {
    const node = findRecipeNode(json);
    if (node) return firstString(node.image);
  }
  return null;
}
