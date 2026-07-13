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
