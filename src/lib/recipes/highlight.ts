export type Segment = { text: string; bold: boolean };

const STOPWORDS = new Set([
  "the", "and", "with", "for", "into", "from", "your", "this", "that", "some", "each", "then",
  "until", "about", "over", "onto", "plus", "large", "small", "fresh", "and", "chopped", "sliced",
  "diced", "to", "of", "a", "an", "or", "in", "on",
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

/** The matchable words for one ingredient: [full phrase, head noun]. Empty when
 *  nothing meaningful survives stripping quantity/units/stopwords. */
function ingredientWords(ing: { display_text: string; name: string | null }): string[] {
  let t = (ing.name ?? ing.display_text).toLowerCase().replace(/\([^)]*\)/g, " ");
  t = t.replace(LEAD_QTY, "").replace(LEAD_UNIT, "");
  // "X of Y" — the ingredient is Y ("can of chopped tomatoes" → "chopped tomatoes").
  if (/\bof\b/.test(t)) t = t.split(/\bof\b/).slice(1).join(" ");
  t = t.replace(/[(),.]/g, " ").split(/\bfor\b|,/)[0]; // drop trailing descriptors
  const words = t.split(/\s+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  if (words.length === 0) return [];
  const phrase = words.join(" ");
  const head = words[words.length - 1];
  return phrase === head ? [phrase] : [phrase, head];
}

export function ingredientTerms(ingredients: Array<{ display_text: string; name: string | null }>): string[] {
  const terms = new Set<string>();
  for (const ing of ingredients) for (const w of ingredientWords(ing)) terms.add(w);
  return [...terms].filter(Boolean).sort((a, b) => b.length - a.length);
}

const wordRe = (w: string) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);

/**
 * The ingredients a given method step refers to. Matches the full ingredient
 * phrase, or its head noun ONLY when that head noun is unique to one ingredient —
 * so "heat the olive oil" doesn't also pull in "vegetable oil" on the shared word
 * "oil". Order follows the ingredient list, not the sentence.
 */
export function ingredientsInStep<T extends { display_text: string; name: string | null }>(
  instruction: string,
  ingredients: T[],
): T[] {
  const text = instruction.toLowerCase();
  const wordsFor = ingredients.map(ingredientWords);
  const headCounts = new Map<string, number>();
  for (const w of wordsFor) {
    const head = w[w.length - 1];
    if (head) headCounts.set(head, (headCounts.get(head) ?? 0) + 1);
  }
  return ingredients.filter((_, i) => {
    const w = wordsFor[i];
    if (w.length === 0) return false;
    const phrase = w[0];
    const head = w[w.length - 1];
    if (wordRe(phrase).test(text)) return true;
    // Head-noun-only match only when that noun isn't shared with another ingredient.
    return phrase !== head && (headCounts.get(head) ?? 0) === 1 && wordRe(head).test(text);
  });
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
