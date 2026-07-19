export type IngredientLike = {
  id: string;
  display_text: string;
  quantity: string | null;
  unit: string | null;
  name: string | null;
};

type IngredientParts = {
  display_text: string;
  quantity?: string | null;
  unit?: string | null;
  name?: string | null;
};

/** Full human line — reconstruct from parts, falling back to the raw display text. */
export function ingredientLine(ing: IngredientParts): string {
  return [ing.quantity, ing.unit, ing.name].filter(Boolean).join(" ") || ing.display_text;
}

/** Just the quantity label (quantity + unit), or null when there's none. */
export function quantityLabel(ing: { quantity?: string | null; unit?: string | null }): string | null {
  return [ing.quantity, ing.unit].filter(Boolean).join(" ") || null;
}

// A leading quantity: an optional "N×" multiplier, then digits / fractions /
// ranges. The multiplier requires a digit before the x/×, so a clean name like
// "xanthan gum" is never mistaken for a quantity. En/em dashes are accepted for
// ranges ("1–2 tbsp"), not just the ASCII hyphen.
const LEADING_QTY = /^(?:\d+\s*[×x]\s*)?[\d\s.,/–—¼½¾⅓⅔⅛⅜⅝⅞+-]+/i;
// Cooking MEASURES only — the "small quantity" units to drop for shopping.
// Discrete purchasable units (can, tin, jar, pack, bottle, bunch, head) are
// deliberately NOT here: you shop by them, so they pass through as counts.
const LEADING_UNIT =
  /^(?:tsp|teaspoons?|tbsp|tablespoons?|cups?|cloves?|slices?|sprigs?|pinch(?:es)?|handfuls?|knobs?|dash(?:es)?|splash(?:es)?|drizzles?|g|kg|ml|l|litres?|oz|lb|lbs|pounds?|grams?|kilograms?|millilitres?)\b\.?\s*/i;
const TRAILING_PARENS = /\s*\([^)]*\)\s*$/;

// Preparation words — how an ingredient is cut or readied, not what you buy.
// Stripped only when they TRAIL the head noun ("onion, finely chopped" → "onion");
// a LEADING prep word is part of the product name and stays ("chopped tomatoes",
// "minced beef"). Adverbs ("finely") and participles ("chopped") both appear.
const PREP_WORD =
  "finely|roughly|coarsely|thinly|thickly|freshly|very|lightly|" +
  "chopped|diced|sliced|minced|grated|crushed|drained|rinsed|peeled|deseeded|" +
  "seeded|trimmed|halved|quartered|cubed|shredded|beaten|melted|softened|" +
  "crumbled|torn|mashed|whisked|sifted|zested|juiced|cored|stoned|pitted|" +
  "skinned|boned|deboned|shelled|podded|segmented|destemmed|stemmed|flaked|" +
  "separated|toasted|roasted";
// A trailing run of one or more prep words, optionally chained with "and"/"&"
// ("peeled and diced"). Anchored to the end so only trailing prep is removed.
const TRAILING_PREP = new RegExp(`(?:\\s+(?:and\\s+|&\\s+)?(?:${PREP_WORD}))+\\s*$`, "i");
// A clause that is ENTIRELY preparation (one or more prep words, chained with
// "and"/"&"). Used to tell a prep descriptor apart from a product variant: the
// suffix of "onion, finely chopped" matches, but "smoked" (bacon) and "red"
// (pepper) do not — so those commas survive.
const PREP_CLAUSE = new RegExp(`^(?:${PREP_WORD})(?:\\s+(?:and\\s+|&\\s+)?(?:${PREP_WORD}))*$`, "i");
const isPrepClause = (s: string): boolean => PREP_CLAUSE.test(s.trim());

/**
 * Drop a trailing preparation clause from an ingredient's noun phrase: a
 * comma-delimited descriptor ("tuna in olive oil, drained" → "tuna in olive
 * oil") and/or a bare trailing prep run ("small onion finely chopped" → "small
 * onion"). Leading prep is never touched; a comma clause is dropped only when it
 * is purely preparation, so product variants survive ("bacon, smoked", "1
 * pepper, red"); and the strip never empties the name or leaves a dangling prep
 * word — a noun-less "finely chopped" is returned intact.
 */
function stripTrailingPrep(text: string): string {
  let s = text.trim();

  const comma = s.indexOf(",");
  if (comma !== -1) {
    const head = s.slice(0, comma).trim();
    const suffix = s.slice(comma + 1).trim();
    if (head && isPrepClause(suffix)) s = head;
  }

  const stripped = s.replace(TRAILING_PREP, "").trim();
  // If stripping would empty the name or leave only a dangling prep word (a
  // noun-less line like "finely chopped"), keep the un-stripped text.
  const kept = !stripped || isPrepClause(stripped) ? s : stripped;
  return kept.replace(/\s+/g, " ").trim();
}

/** Is `unit` a cooking measure (dropped for shopping) vs a countable ("can")? */
export function isMeasureUnit(unit: string | null | undefined): boolean {
  return Boolean(unit && LEADING_UNIT.test(unit.trim()));
}

/**
 * The grocery-list line for an ingredient — what you'd actually write on a
 * shopping list. A cooking MEASURE is dropped ("1 tbsp olive oil" → "olive oil",
 * "Tsp salt" → "salt", "2 cloves garlic" → "garlic") because you don't shop by
 * the teaspoon; a bare COUNT is kept ("3 lemons" → "3 lemons", "2 eggs" → "2
 * eggs") because the number is the thing you're buying. The extractor often
 * leaves the whole line in `name` with quantity/unit null, so we derive from the
 * text; when structured fields are clean, `name` is already the bare noun and the
 * count comes from groceryQuantity instead.
 */
export function groceryName(ing: { display_text: string; name?: string | null }): string {
  const original = (ing.name ?? ing.display_text).trim();
  const s = original.replace(TRAILING_PARENS, "").trim();

  const qtyMatch = s.match(LEADING_QTY);
  const leadingQty = qtyMatch ? qtyMatch[0].trim() : "";
  const rest = qtyMatch ? s.slice(qtyMatch[0].length) : s;

  // A unit right after the (optional) number → measured quantity: drop both.
  const unitMatch = rest.match(LEADING_UNIT);
  if (unitMatch) {
    const item = stripTrailingPrep(rest.slice(unitMatch[0].length));
    return item || rest.replace(/\s+/g, " ").trim() || original;
  }

  // No unit. Keep a real leading count with the item ("3 lemons"); otherwise the name.
  const item = stripTrailingPrep(rest);
  const hasNumber = /[\d¼½¾⅓⅔⅛⅜⅝⅞]/.test(leadingQty);
  if (hasNumber && item) return `${leadingQty} ${item}`.replace(/\s+/g, " ").trim();
  return item || original;
}

/**
 * The grocery quantity for an ingredient, from its STRUCTURED fields only — used
 * when the extractor separated quantity/unit cleanly. A cooking measure is
 * dropped (returns null); a bare count or a countable unit (a "can") is kept.
 * When structured fields are absent the count is already inline in groceryName,
 * so this returns null to avoid doubling it.
 */
export function groceryQuantity(ing: { quantity?: string | null; unit?: string | null }): string | null {
  if (!ing.quantity && !ing.unit) return null;
  if (isMeasureUnit(ing.unit)) return null;
  return quantityLabel(ing);
}
