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
/** The matchable words for one ingredient: [full phrase, head noun]. Empty when
 *  nothing meaningful survives stripping quantity/units/stopwords. */
function ingredientWords(ing: { display_text: string; name: string | null }): string[] {
  let t = (ing.name ?? ing.display_text).toLowerCase();
  t = t
    .replace(/^[\d\s./¼½¾⅓⅔x×-]+/, "") // strip leading quantity
    .replace(/\b\d+\s?(?:g|kg|ml|l|tbsp|tsp|cups?|cloves?|slices?|oz|lb)\b/g, " ")
    .replace(/[(),.]/g, " ")
    .split(/\bof\b|\bfor\b|,/)[0]; // drop trailing descriptors
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

/**
 * The ingredients a given method step refers to — matched by the same head-noun
 * terms the step highlighter uses, so the per-step drawer and the bolded words
 * stay in agreement. Order follows the ingredient list, not the sentence.
 */
export function ingredientsInStep<T extends { display_text: string; name: string | null }>(
  instruction: string,
  ingredients: T[],
): T[] {
  const text = instruction.toLowerCase();
  return ingredients.filter((ing) =>
    ingredientWords(ing).some((w) =>
      new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text),
    ),
  );
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
