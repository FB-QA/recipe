export type Segment = { text: string; bold: boolean };

// Prep words (chopped/sliced/diced) are deliberately NOT stopwords: they
// distinguish variants like "chopped tomatoes" vs "diced tomatoes", which would
// otherwise both collapse to "tomatoes" and cross-match in the step drawer.
const STOPWORDS = new Set([
  "the", "and", "with", "for", "into", "from", "your", "this", "that", "some", "each", "then",
  "until", "about", "over", "onto", "plus", "large", "small", "to", "of", "a", "an", "or", "in", "on",
]);

// State/availability qualifiers. Stripped only as a TRAILING tail — "mixed berries
// fresh or frozen" → "mixed berries", "salt to taste" → "salt" — because there the
// qualifier is incidental. A LEADING one is kept ("frozen berries" stays distinct
// from "fresh berries"), since in that position it is the distinguishing word.
const QUALIFIERS = new Set([
  "fresh", "frozen", "optional", "divided", "drained", "rinsed", "softened", "melted", "thawed", "chilled", "taste",
]);

// Numbers with optional cooking units / times / temperatures.
const MEASURE =
  String.raw`\d+(?:[.,/]\d+)?\s*(?:°\s?[cf]|degrees?|min(?:ute)?s?|hours?|hrs?|seconds?|secs?|kg|g|ml|litres?|l|tbsp|tsp|cups?|cloves?|slices?)?`;

/** Derive matchable terms (ingredient names) from a recipe's ingredients. */
// Leading quantity (multiplier-safe so "xanthan" is never mistaken for one; en/em
// dash ranges) and a leading cooking-unit or container word, stripped to reach the
// ingredient. Container counters (can/tin/jar/packet…) matter beyond tidiness: left
// in, "1 can coconut milk" keeps "can" as a significant word, so it no longer fully
// matches "coconut milk" and can't out-rank "coconut milk powder" (see matchStep).
const LEAD_QTY = /^(?:\d+\s*[×x]\s*)?[\d\s.,/–—¼½¾⅓⅔⅛⅜⅝⅞+-]+/;
const LEAD_UNIT =
  /^(?:tsp|teaspoons?|tbsp|tablespoons?|cups?|cloves?|slices?|sprigs?|pinch(?:es)?|handfuls?|knobs?|dash(?:es)?|cans?|tins?|jars?|packets?|packs?|bottles?|boxes|tubs?|cartons?|bags?|sticks?|blocks?|bunch(?:es)?|g|kg|ml|l|litres?|oz|lb|lbs|grams?|kilograms?|millilitres?)\b\.?\s*/;

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
  // Drop a trailing descriptor after a comma or "for …" ("parmesan, grated" →
  // "parmesan") BEFORE flattening punctuation — otherwise the comma is gone and the
  // split never fires. A leading prep adjective ("chopped tomatoes", no comma) is
  // deliberately kept; only the incidental trailing form is dropped.
  t = t.split(/\bfor\b|,/)[0].replace(/[(),.]/g, " ");
  const words = t.split(/\s+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  // Strip a trailing run of state qualifiers ("… fresh or frozen", "… optional").
  while (words.length > 1 && QUALIFIERS.has(words[words.length - 1])) words.pop();
  return words;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A regex fragment matching a single word across a regular singular↔plural
 *  difference, so a step's "the onions" finds the "1 onion" ingredient and a
 *  "2 chicken breasts" ingredient is found by "sear the breast". Irregular
 *  plurals (mouse/mice) fall through to an exact match — acceptable, since food
 *  nouns are overwhelmingly regular. */
function wordVariants(word: string): string {
  const w = word.toLowerCase();
  // Plural input → also match its singular.
  if (/[^aeiou]ies$/.test(w)) return `${escapeRegExp(w.slice(0, -3))}(?:y|ies)`; // berries↔berry
  if (/(?:ch|sh|s|x|z)es$/.test(w)) return `${escapeRegExp(w.slice(0, -2))}(?:es)?`; // dishes↔dish, boxes↔box
  if (/oes$/.test(w)) return `${escapeRegExp(w.slice(0, -2))}(?:es)?`; // tomatoes↔tomato
  if (/s$/.test(w) && !/(?:ss|us|is)$/.test(w)) return `${escapeRegExp(w.slice(0, -1))}s?`; // onions↔onion, breasts↔breast
  // Singular input → also match its plural.
  if (/[^aeiou]y$/.test(w)) return `${escapeRegExp(w.slice(0, -1))}(?:y|ies)`; // berry↔berries
  if (/(?:ch|sh|s|x|z|o)$/.test(w)) return `${escapeRegExp(w)}(?:es|s)?`; // dish↔dishes, tomato↔tomatoes
  return `${escapeRegExp(w)}s?`; // onion↔onions
}

/** A plural-invariant key: a singular and its regular plural collapse to the same
 *  value (onion/onions, tomato/tomatoes, berry/berries → one key). Used to count
 *  shared nouns, so plural tolerance can't sneak a second "onion" past the guard
 *  that stops a bare noun matching two different ingredients. Mirrors
 *  {@link wordVariants}. */
function canonicalNoun(word: string): string {
  const w = word.toLowerCase();
  if (/[^aeiou]ies$/.test(w)) return `${w.slice(0, -3)}y`; // berries → berry
  if (/(?:ch|sh|s|x|z)es$/.test(w)) return w.slice(0, -2); // dishes → dish, boxes → box
  if (/oes$/.test(w)) return w.slice(0, -2); // tomatoes → tomato
  if (/s$/.test(w) && !/(?:ss|us|is)$/.test(w)) return w.slice(0, -1); // onions → onion, grapes → grape
  return w; // already singular
}

/** Plural-tolerant regex source for a phrase: only the final noun varies; leading
 *  words match verbatim. Shared by the matcher and the highlighter so the drawer
 *  and the bolded words always agree. */
function phraseSource(phrase: string): string {
  const parts = phrase.split(" ");
  const last = parts.pop() ?? "";
  return [...parts.map(escapeRegExp), wordVariants(last)].join(" ");
}

const wordRe = (w: string) => new RegExp(`\\b${phraseSource(w)}\\b`);

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
  // Count head nouns by their plural-invariant key, so "onion" and "spring onions"
  // register as the shared noun they are once plural tolerance is in play.
  const headCounts = new Map<string, number>();
  for (const w of wordsFor) {
    const head = w[w.length - 1];
    if (head) headCounts.set(canonicalNoun(head), (headCounts.get(canonicalNoun(head)) ?? 0) + 1);
  }

  // First position in the step where a term matches, with its length — used to
  // arbitrate overlapping matches positionally below.
  const matchSpan = (pattern: string): { at: number; end: number } | null => {
    const m = wordRe(pattern).exec(text);
    return m ? { at: m.index, end: m.index + m[0].length } : null;
  };

  // A hit records the matched substring and where it landed, whether it is the
  // ingredient's FULL significant phrase (vs a shortened run), and the words the
  // term left behind — all needed to arbitrate the overlaps below.
  type Hit = { index: number; term: string; full: boolean; leftover: string[]; at: number; end: number };
  const hits: Hit[] = [];
  ingredients.forEach((_, i) => {
    const words = wordsFor[i];
    if (words.length === 0) return;
    let term: string | null = null;
    let span: { at: number; end: number } | null = null;
    // Longest contiguous ≥2-word run the step quotes.
    for (let len = words.length; len >= 2 && !term; len--) {
      for (let start = 0; start + len <= words.length; start++) {
        const gram = words.slice(start, start + len).join(" ");
        span = matchSpan(gram);
        if (span) {
          term = gram;
          break;
        }
      }
    }
    // Single-word ingredient (salt, flour): match on the word itself. Otherwise
    // fall back to the head noun, but only when that noun is unique to this
    // ingredient — so "heat the oil" never pulls in both oils. The subset-drop
    // below removes a bare noun matched INSIDE a longer phrase ("onion" within
    // "spring onions").
    if (!term) {
      const head = words[words.length - 1];
      if (words.length === 1 || (headCounts.get(canonicalNoun(head)) ?? 0) === 1) span = matchSpan(head);
      if (span) term = head;
    }
    if (term && span) {
      const termSet = new Set(term.split(" "));
      hits.push({
        index: i,
        term,
        full: termSet.size === words.length,
        leftover: words.filter((w) => !termSet.has(w)),
        at: span.at,
        end: span.end,
      });
    }
  });

  // Drop a hit whose matched span sits INSIDE a longer hit's span — so "chili"
  // matched within "chili flakes", or "onion" within "spring onions", doesn't
  // also surface on its own. Positional (not word-set) containment is the point:
  // separately-quoted "eggs" and "egg whites" don't overlap, so both survive.
  const subsetKept = hits.filter(
    (a) => !hits.some((b) => b !== a && b.end - b.at > a.end - a.at && b.at <= a.at && a.end <= b.end),
  );

  // Drop a SHORTENED match that collides with another ingredient owning that exact
  // phrase in full — "coconut milk powder" matching only "coconut milk" when a
  // plain "coconut milk" is present. The guard: keep it if any leftover word is
  // itself quoted by the step (then the longer ingredient is genuinely referenced —
  // "honey or maple syrup" survives a step naming honey), or if nothing owns the
  // phrase in full (shortened matching is still the only way to reach that row).
  const kept = subsetKept.filter(
    (h) =>
      h.full ||
      h.leftover.some((w) => wordRe(w).test(text)) ||
      !subsetKept.some((o) => o !== h && o.full && o.term === h.term),
  );

  // The same ingredient text can appear in two variant groups within one recipe
  // (a Berry and a Chocolate version); show it once — but key on the SHOWN text, so
  // two rows sharing a name yet differing in amount both survive. Terms carry every
  // match so both quoted spellings still bold.
  const seen = new Set<string>();
  const out: T[] = [];
  const terms = new Set<string>();
  for (const h of kept) {
    terms.add(h.term);
    const ing = ingredients[h.index];
    const key = ing.display_text.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ing);
  }
  return { ingredients: out, terms: [...terms].sort((a, b) => b.length - a.length) };
}

/** Split a step into segments, marking measures and ingredient terms as bold. */
export function highlightStep(text: string, terms: string[]): Segment[] {
  const escaped = terms.filter(Boolean).map(phraseSource);
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
