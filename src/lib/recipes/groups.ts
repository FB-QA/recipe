import type { IngredientInput, IngredientGroupInput, RecipeInput } from "./schema";

/**
 * Resolve a recipe input into the ordered ingredient sections the save path
 * persists (import-capture-review-v2, W6). A recipe with structured
 * `ingredientGroups` keeps them verbatim; a flat manual recipe collapses to a
 * single unnamed group — which the detail view renders with no heading (§18).
 * Empty groups and empty ingredients are dropped, never invented.
 */

export interface GroupForSave {
  name: string | null;
  optional: boolean;
  ingredients: IngredientInput[];
}

function cleanIngredients(list: IngredientInput[]): IngredientInput[] {
  return list.filter((i) => i.display_text.trim().length > 0);
}

export function resolveGroups(input: Pick<RecipeInput, "ingredients" | "ingredientGroups">): GroupForSave[] {
  const source: IngredientGroupInput[] =
    input.ingredientGroups && input.ingredientGroups.length > 0
      ? input.ingredientGroups
      : [{ name: null, optional: false, ingredients: input.ingredients }];

  const groups: GroupForSave[] = [];
  for (const g of source) {
    const ingredients = cleanIngredients(g.ingredients);
    if (ingredients.length === 0) continue; // an empty section is not persisted
    groups.push({ name: g.name?.trim() || null, optional: g.optional ?? false, ingredients });
  }
  return groups;
}

/** A single flat ordered ingredient row list with its group index, for insert. */
export interface FlatIngredientRow {
  groupIndex: number;
  sort_order: number;
  display_text: string;
  quantity: string | null;
  unit: string | null;
  name: string | null;
  quantity_value: number | null;
  quantity_min: number | null;
  quantity_max: number | null;
  preparation: string | null;
  optional: boolean;
  alternative_group: string | null;
}

/** Flatten resolved groups into ordered ingredient rows tagged with their group index. */
export function flattenIngredients(groups: GroupForSave[]): FlatIngredientRow[] {
  const rows: FlatIngredientRow[] = [];
  let sort = 0;
  groups.forEach((group, groupIndex) => {
    for (const ing of group.ingredients) {
      rows.push({
        groupIndex,
        sort_order: sort++,
        display_text: ing.display_text.trim(),
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? null,
        name: ing.name ?? null,
        quantity_value: ing.quantity_value ?? null,
        quantity_min: ing.quantity_min ?? null,
        quantity_max: ing.quantity_max ?? null,
        preparation: ing.preparation ?? null,
        optional: ing.optional ?? false,
        alternative_group: ing.alternative_group ?? null,
      });
    }
  });
  return rows;
}
