export type Segment = { text: string; bold: boolean };

// Prep words (chopped/sliced/diced) are deliberately NOT stopwords: they
// distinguish variants like "chopped tomatoes" vs "diced tomatoes", which would
// otherwise both collapse to "tomatoes" and cross-match in the step drawer.
//
// State/availability qualifiers (fresh, frozen, optional, divided, drained…) ARE
// stopwords: they never define what an ingredient IS, and — worse — a source that
// flattens a parenthetical into the name ("mixed berries (fresh or frozen)" →
// "mixed berries fresh or frozen") would otherwise leave "frozen" as the head
// noun, then falsely match any step that says "freeze until frozen solid".
const STOPWORDS = new Set([
  "the", "and", "with", "for", "into", "from", "your", "this", "that", "some", "each", "then",
  "until", "about", "over", "onto", "plus", "large", "small", "to", "of", "a", "an", "or", "in", "on",
  "fresh", "frozen", "optional", "divided", "drained", "rinsed", "softened", "melted", "thawed", "chilled",
]);

// Numbers with optional cooking units / times / temperatures.
const MEASURE =
  String.raw`\d+(?:[.,/]\d+)?\s*(?:°\s?[cf]|degrees?|min(?:ute)?s?|hours?|hrs?|seconds?|secs?|kg|g|ml|litres?|l|tbsp|tsp|cups?|cloves?|slices?)?`;

/** Derive matchable terms (ingredient names) from a recipe's ingredients. */
// Leading quantity (multiplier-safe so "xanthan" is never mistaken for one; en/em
// dash ranges) and a leading cooking-unit word, stripped to reach the ingredient.
const LEAD_QTY = /^(?:\d+\s*[×x]\s*)?[\d\s.,/–—¼½¾⅓⅔⅛⅜⅝⅞+-]+/;
const LEAD_UNIT =
  /^(?:tsp|teaspoons?|tbsp|tablespoons?|cups?|cloves?|slices?|sprigs?|pinch(?:es)?|handfuls?|knobs?|dash(?:es)?|g|kg|ml|l|litres?|oz|lb|lbs|grams?|kilograms?|millilitres?)\b\.?\s*/;

/** The significant words of one ingredient, in order — quantity, unit and
 *  stopwords stripped. Empty when nothing meaningful survives. This is the raw
 *  material for matching: a step may quote any contiguous run of these words
 *  ("whole milk cottage cheese" → "cottage cheese"), so we keep the full ordered
 *  list rather than collapsing to a single phrase + head. */
function significantWords(ing: { display_text: string; name: string | null }): string[] {
  let t = (ing.name ?? ing.display_text).toLowerCase().replace(/\([^)]*\)/g, " ");
  t = t.replace(LEAD_QTY, "").replace(LEAD_UNIT, "");
  // "X of Y" — the ingredient is Y ("can of chopped tomatoes" → "chopped tomatoes").
  if (/\bof\b/.test(t)) t = t.split(/\bof\b/).slice(1).join(" ");
  t = t.replace(/[(),.]/g, " ").split(/\bfor\b|,/)[0]; // drop trailing descriptors
  return t.split(/\s+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

const wordRe = (w: string) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);

type Ingredientish = { display_text: string; name: string | null };

/**
 * The ingredients a method step refers to, paired with the exact substring that
 * matched — so the drawer (which ingredients) and the bolding (which words) are
 * driven by one decision and can never disagree.
 *
 * An ingredient matches on the LONGEST contiguous run of its significant words
 * that the step quotes: a step rarely repeats an ingredient's full stored name
 * ("2 cups whole milk cottage cheese") — it says "cottage cheese". Requiring a
 * ≥2-word run keeps that specific while stepping over both extra leading words
 * ("whole milk …") and trailing qualifiers ("… fresh or frozen") without having
 * to guess which words are qualifiers. A bare head noun matches only when it is
 * unique across the recipe, so "heat the olive oil" never also pulls in
 * "vegetable oil" on the shared word "oil". Order follows the ingredient list.
 */
export function matchStep<T extends Ingredientish>(
  instruction: string,
  ingredients: T[],
): { ingredients: T[]; terms: string[] } {
  const text = instruction.toLowerCase();
  const wordsFor = ingredients.map(significantWords);
  const headCounts = new Map<string, number>();
  for (const w of wordsFor) {
    const head = w[w.length - 1];
    if (head) headCounts.set(head, (headCounts.get(head) ?? 0) + 1);
  }

  const hits: { index: number; term: string }[] = [];
  ingredients.forEach((_, i) => {
    const words = wordsFor[i];
    if (words.length === 0) return;
    let term: string | null = null;
    // Longest contiguous ≥2-word run the step quotes.
    for (let len = words.length; len >= 2 && !term; len--) {
      for (let start = 0; start + len <= words.length; start++) {
        const gram = words.slice(start, start + len).join(" ");
        if (wordRe(gram).test(text)) {
          term = gram;
          break;
        }
      }
    }
    // Single-word ingredient (salt, flour): match on the word itself. Otherwise
    // fall back to the head noun, but only when it is unique to this ingredient.
    if (!term) {
      const head = words[words.length - 1];
      if (words.length === 1) {
        if (wordRe(head).test(text)) term = head;
      } else if ((headCounts.get(head) ?? 0) === 1 && wordRe(head).test(text)) {
        term = head;
      }
    }
    if (term) hits.push({ index: i, term });
  });

  // Drop a hit whose matched words are a strict subset of another's — so
  // "chili flakes" in a step doesn't also surface a standalone "chili".
  const termWords = hits.map((h) => new Set(h.term.split(" ")));
  const kept = hits.filter((_, a) =>
    !hits.some(
      (__, b) => a !== b && termWords[a].size < termWords[b].size && [...termWords[a]].every((w) => termWords[b].has(w)),
    ),
  );

  // The same ingredient text can appear in two variant groups within one recipe
  // (a Berry and a Chocolate version); show it once. Terms carry every match so
  // both quoted spellings still bold.
  const seen = new Set<string>();
  const out: T[] = [];
  const terms = new Set<string>();
  for (const h of kept) {
    terms.add(h.term);
    const ing = ingredients[h.index];
    const key = (ing.name ?? ing.display_text).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ing);
  }
  return { ingredients: out, terms: [...terms].sort((a, b) => b.length - a.length) };
}

/** The ingredients a method step refers to (see {@link matchStep}). */
export function ingredientsInStep<T extends Ingredientish>(instruction: string, ingredients: T[]): T[] {
  return matchStep(instruction, ingredients).ingredients;
}

/** Split a step into segments, marking measures and ingredient terms as bold. */
export function highlightStep(text: string, terms: string[]): Segment[] {
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter(Boolean);
  const source = escaped.length > 0 ? `(?:${MEASURE})|\\b(?:${escaped.join("|")})\\b` : MEASURE;
  const re = new RegExp(source, "gi");

  const segments: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (!m[0]) continue;
    if (idx > last) segments.push({ text: text.slice(last, idx), bold: false });
    segments.push({ text: m[0], bold: true });
    last = idx + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), bold: false });
  return segments;
}
