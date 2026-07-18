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

const LEADING_QTY = /^[\d\s.,/×x¼½¾⅓⅔⅛⅜⅝⅞+-]+/i;
const LEADING_UNIT =
  /^(?:tsp|teaspoons?|tbsp|tablespoons?|cups?|cloves?|slices?|cans?|tins?|sticks?|sprigs?|pinch(?:es)?|handfuls?|knobs?|dash(?:es)?|bunch(?:es)?|g|kg|ml|l|litres?|oz|lb|lbs|pounds?|grams?|kilograms?|millilitres?)\b\.?\s*/i;
const TRAILING_PARENS = /\s*\([^)]*\)\s*$/;

/**
 * The clean grocery-list name for an ingredient: the item you'd shop for, with
 * the measurement stripped off — "1 tbsp olive oil" → "olive oil", "Tsp salt" →
 * "salt", "½ tsp chilli flakes (optional)" → "chilli flakes". The extractor
 * often leaves the whole line in `name` with quantity/unit null, so we can't
 * trust those fields — derive from the text instead. Falls back to the original
 * when stripping would leave nothing (e.g. the name was already clean).
 */
export function groceryName(ing: { display_text: string; name?: string | null }): string {
  const original = (ing.name ?? ing.display_text).trim();
  let s = original.replace(TRAILING_PARENS, "").trim();
  s = s.replace(LEADING_QTY, ""); // strip a leading quantity / fraction / range
  s = s.replace(LEADING_UNIT, ""); // then a unit word, if one follows
  s = s.replace(/\s+/g, " ").trim();
  return s || original.replace(TRAILING_PARENS, "").trim() || original;
}
