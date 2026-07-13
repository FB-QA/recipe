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
export function ingredientTerms(ingredients: Array<{ display_text: string; name: string | null }>): string[] {
  const terms = new Set<string>();
  for (const ing of ingredients) {
    let t = (ing.name ?? ing.display_text).toLowerCase();
    t = t
      .replace(/^[\d\s./¼½¾⅓⅔x×-]+/, "") // strip leading quantity
      .replace(/\b\d+\s?(?:g|kg|ml|l|tbsp|tsp|cups?|cloves?|slices?|oz|lb)\b/g, " ")
      .replace(/[(),.]/g, " ")
      .split(/\bof\b|\bfor\b|,/)[0]; // drop trailing descriptors
    const words = t.split(/\s+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
    if (words.length === 0) continue;
    terms.add(words.join(" "));
    terms.add(words[words.length - 1]); // the head noun on its own
  }
  return [...terms].filter(Boolean).sort((a, b) => b.length - a.length);
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
