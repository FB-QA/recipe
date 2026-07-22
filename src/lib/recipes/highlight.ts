export type Segment = { text: string; bold: boolean };

// Prep words (chopped/sliced/diced) are deliberately NOT stopwords: they
// distinguish variants like "chopped tomatoes" vs "diced tomatoes", which would
// otherwise both collapse to "tomatoes" and cross-match in the step drawer.
const STOPWORDS = new Set([
  "the", "and", "with", "for", "into", "from", "your", "this", "that", "some", "each", "then",
  "until", "about", "over", "onto", "plus", "large", "small", "to", "of", "a", "an", "or", "in", "on",
]);

// Descriptors stripped only as a TRAILING tail — "mixed berries fresh or frozen" →
// "mixed berries", "salt to taste" → "salt", "cashews, chopped" / "cashews chopped"
// (a flattened "(chopped)") → "cashews". A LEADING one is kept ("frozen berries"
// stays distinct from "fresh berries", "chopped tomatoes" from "diced tomatoes"),
// since in that position it distinguishes the ingredient. Two flavours: state
// qualifiers and prep/cut past-participles.
const QUALIFIERS = new Set([
  "fresh", "frozen", "optional", "divided", "drained", "rinsed", "softened", "melted", "thawed", "chilled", "taste",
]);
const PREP = new Set([
  "chopped", "sliced", "diced", "minced", "grated", "crushed", "cubed", "shredded", "halved", "quartered",
  "crumbled", "torn", "beaten", "mashed", "peeled", "pitted", "seeded", "deseeded", "zested", "toasted", "roasted", "cooked",
]);
const TRAILING = new Set([...QUALIFIERS, ...PREP]);

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
  /^(?:tsp|teaspoons?|tbsp|tablespoons?|cups?|cloves?|slices?|sprigs?|pinch(?:es)?|handfuls?|knobs?|dash(?:es)?|cans?|tins?|jars?|packets?|packs?|bottles?|box(?:es)?|tubs?|cartons?|bags?|sticks?|blocks?|bunch(?:es)?|g|kg|ml|l|litres?|oz|lb|lbs|grams?|kilograms?|millilitres?)\b\.?\s*/;

/** The matchable phrases of one ingredient, each an ordered significant-word list —
 *  quantity, unit and stopwords stripped. Usually one, but an "A or B" ingredient
 *  yields one per alternative name ("tamari or soy sauce" → ["tamari"], ["soy",
 *  "sauce"]), since the step may quote either. Empty list when nothing survives.
 *  A step may quote any contiguous run of a phrase's words ("whole milk cottage
 *  cheese" → "cottage cheese"), so each phrase keeps its full ordered list. */
function significantWordAlts(ing: { display_text: string; name: string | null }): string[][] {
  let t = (ing.name ?? ing.display_text).toLowerCase().replace(/\([^)]*\)/g, " ");
  t = t.replace(LEAD_QTY, "").replace(LEAD_UNIT, "");
  // "X of Y" — the ingredient is Y ("can of chopped tomatoes" → "chopped tomatoes").
  if (/\bof\b/.test(t)) t = t.split(/\bof\b/).slice(1).join(" ");
  // Drop a trailing descriptor after a comma or "for …" ("parmesan, grated" →
  // "parmesan") BEFORE flattening punctuation — otherwise the comma is gone and the
  // split never fires. A leading prep adjective ("chopped tomatoes") is kept.
  t = t.split(/\bfor\b|,/)[0].replace(/[(),.]/g, " ");
  // Keep "or" as a separator token so genuine alternatives can be split out; drop
  // stopwords and short noise otherwise.
  const toks = t.split(/\s+/).filter((w) => w === "or" || (w.length >= 3 && !STOPWORDS.has(w)));
  // Strip a trailing qualifier tail, INCLUDING an "or" that joins qualifiers
  // ("… fresh or frozen" → …, "… to taste" → …). Doing this before the alternative
  // split is what stops "fresh or frozen" being mistaken for two alternatives.
  while (toks.length > 1 && (toks[toks.length - 1] === "or" || TRAILING.has(toks[toks.length - 1]))) toks.pop();
  return (
    toks
      .join(" ")
      .split(/\bor\b/)
      .map((part) => part.split(/\s+/).filter(Boolean))
      // Keep an alternative only if it carries a word that actually names something
      // (not a lone leading qualifier like the "fresh" of "fresh or frozen berries").
      .filter((a) => a.some((w) => !TRAILING.has(w)))
  );
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A regex fragment matching a single word across a regular singular↔plural
 *  difference, so a step's "the onions" finds the "1 onion" ingredient and a
 *  "2 chicken breasts" ingredient is found by "sear the breast". Irregular
 *  plurals (mouse/mice) fall through to an exact match — acceptable, since food
 *  nouns are overwhelmingly regular. */
function wordVariants(word: string): string {
  const w = word.toLowerCase();
  // Plural input → also match its singular. -ies is ambiguous (berries→berry vs
  // cookies→cookie), so offer both singular stems plus the plural itself.
  if (/[^aeiou]ies$/.test(w)) return `(?:${escapeRegExp(w)}|${escapeRegExp(w.slice(0, -3))}y|${escapeRegExp(w.slice(0, -1))})`; // berries↔berry, cookies↔cookie
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
  // -ies is ambiguous (berry→berries vs cookie→cookies); collapse BOTH the plural
  // and either singular to one shared key, so wordVariants and this agree.
  if (/[^aeiou]ies$/.test(w)) return w.slice(0, -1); // berries → berrie, cookies → cookie
  if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ie`; // berry → berrie
  if (/(?:ch|sh|s|x|z)es$/.test(w)) return w.slice(0, -2); // dishes → dish, boxes → box
  if (/oes$/.test(w)) return w.slice(0, -2); // tomatoes → tomato
  if (/s$/.test(w) && !/(?:ss|us|is)$/.test(w)) return w.slice(0, -1); // onions → onion, grapes → grape
  return w; // already singular (incl. -ie: cookie → cookie)
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
  // A "unit" is one matchable phrase; an "A or B" ingredient contributes one per
  // alternative, all pointing back to the same ingredient index.
  const units: Array<{ index: number; words: string[] }> = [];
  ingredients.forEach((ing, index) => {
    for (const words of significantWordAlts(ing)) units.push({ index, words });
  });
  // Head nouns keyed by plural-invariant form → the DISTINCT ingredients carrying
  // that head. Distinct-ingredient count (not unit count) is what "unique" means,
  // so a single "basil or Thai basil" row doesn't shadow its own head noun.
  const headIndexes = new Map<string, Set<number>>();
  for (const u of units) {
    const head = u.words[u.words.length - 1];
    if (head) {
      const k = canonicalNoun(head);
      (headIndexes.get(k) ?? headIndexes.set(k, new Set()).get(k)!).add(u.index);
    }
  }
  const headUnique = (w: string) => (headIndexes.get(canonicalNoun(w))?.size ?? 0) === 1;

  // Every span in the step where a term matches (plural-tolerant, non-overlapping),
  // EXCLUDING an occurrence that heads an "X of Y" compound where Y is itself an
  // ingredient noun — "cream of tartar" when the recipe lists cream of tartar, so a
  // bare "cream" can't claim it. Ordinary prose ("drain the pasta of excess water")
  // is left alone, since "excess" is nobody's ingredient.
  const spansOf = (term: string): Array<{ at: number; end: number }> =>
    [...text.matchAll(new RegExp(`\\b${phraseSource(term)}\\b`, "g"))]
      .map((m) => ({ at: m.index ?? 0, end: (m.index ?? 0) + m[0].length }))
      .filter((sp) => {
        const after = text.slice(sp.end).match(/^\s+of\s+([a-z]+)/i);
        return !(after && headIndexes.has(canonicalNoun(after[1])));
      });

  // A hit records the matched substring, whether it is the ingredient's FULL
  // significant phrase (vs a shortened run), and the words the term left behind —
  // both needed to arbitrate the collision below.
  type Hit = { index: number; term: string; words: number; full: boolean; leftover: string[] };
  const hits: Hit[] = [];
  units.forEach((u) => {
    const words = u.words;
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
    // Single-word phrase (salt, or the "tamari" of "tamari or soy sauce"): match on
    // the word itself. Otherwise fall back to the head noun, but only when that noun
    // is unique to this ingredient — so "heat the oil" never pulls in both oils.
    if (!term) {
      const head = words[words.length - 1];
      if ((words.length === 1 || headUnique(head)) && wordRe(head).test(text)) term = head;
    }
    if (term) {
      const termSet = new Set(term.split(" "));
      hits.push({
        index: u.index,
        term,
        words: termSet.size,
        full: termSet.size === words.length,
        leftover: words.filter((w) => !termSet.has(w)),
      });
    }
  });

  // Drop a bare match that only ever appears INSIDE a longer phrase another
  // ingredient owns — "chili" within "chili flakes", "onion" within "spring
  // onions". A hit survives if it has ANY occurrence not covered by a
  // longer-phrase hit, so "cream" beaten as "cream cheese" AND whipped alone,
  // or separately-quoted "eggs" and "egg whites", both stay.
  const hitSpans = hits.map((h) => spansOf(h.term));
  const subsetKept = hits.filter((a, ai) =>
    hitSpans[ai].some(
      (sa) =>
        !hits.some(
          (b, bi) => bi !== ai && b.words > a.words && hitSpans[bi].some((sb) => sb.at <= sa.at && sa.end <= sb.end),
        ),
    ),
  );

  // Drop a SHORTENED match that collides with another ingredient owning that same
  // phrase in full — "coconut milk powder" matching only "coconut milk" when a
  // plain "coconut milk" is present. Compare the owned phrase plural-invariantly
  // (canned tomatoes ≡ canned tomato), so a plural difference can't hide the
  // collision. The guard: keep it if a leftover word appears NEXT TO the matched
  // phrase (then the longer ingredient is genuinely referenced — "honey or maple
  // syrup" survives a step naming honey right beside the syrup), or if nothing
  // owns the phrase in full (shortened matching is still the only way to reach it).
  // "Next to" matters: an unrelated "cocoa powder" elsewhere in the step must not
  // vouch for "coconut milk powder".
  const canonPhrase = (t: string) => t.split(" ").map(canonicalNoun).join(" ");
  const leftoverBesideTerm = (h: Hit): boolean => {
    const near = spansOf(h.term).map((sp) => text.slice(Math.max(0, sp.at - 18), sp.end + 18));
    return h.leftover.some((w) => near.some((ctx) => wordRe(w).test(ctx)));
  };
  const kept = subsetKept.filter(
    (h) =>
      h.full ||
      leftoverBesideTerm(h) ||
      !subsetKept.some((o) => o !== h && o.full && canonPhrase(o.term) === canonPhrase(h.term)),
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
