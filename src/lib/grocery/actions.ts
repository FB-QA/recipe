"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, type Client } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth/session";
import { categorize } from "./categorize";
import { scaleIngredientText } from "@/lib/recipes/scale";
import { quantityLabel } from "@/lib/recipes/ingredient";

async function nextSortOrder(supabase: Client, listId: string): Promise<number> {
  const { data } = await supabase
    .from("grocery_items")
    .select("sort_order")
    .eq("list_id", listId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.sort_order ?? -1) + 1;
}

export async function createList(_prev: unknown, formData: FormData): Promise<void> {
  const name = z.string().trim().min(1).max(80).safeParse(formData.get("name"));
  if (!name.success) return;

  const supabase = await createClient();
  const { data } = await supabase.from("grocery_lists").insert({ name: name.data }).select("id").single();
  revalidatePath("/list");
  if (data) redirect(`/list?list=${data.id}`);
}

/** Client-callable list create that returns the id (no redirect) so the caller
 * can select it and show a toast. */
export async function createNamedList(name: string): Promise<{ id: string } | null> {
  const parsed = z.string().trim().min(1).max(80).safeParse(name);
  if (!parsed.success) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("grocery_lists")
    .insert({ name: parsed.data })
    .select("id")
    .single();
  revalidatePath("/list");
  return data ? { id: data.id } : null;
}

export async function renameList(id: string, name: string) {
  const parsed = z.string().trim().min(1).max(80).safeParse(name);
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.from("grocery_lists").update({ name: parsed.data }).eq("id", id);
  revalidatePath("/list");
}

export async function deleteList(id: string) {
  const supabase = await createClient();
  await supabase.from("grocery_lists").delete().eq("id", id);
  // No redirect: the board re-renders in place so edit-mode survives deleting
  // several lists in a row. A deleted active list falls back to the All view.
  revalidatePath("/list");
}

export async function addItem(listId: string, text: string) {
  const parsed = z.string().trim().min(1).max(300).safeParse(text);
  if (!parsed.success) return;
  const supabase = await createClient();
  const sort = await nextSortOrder(supabase, listId);
  await supabase.from("grocery_items").insert({
    list_id: listId,
    display_text: parsed.data,
    sort_order: sort,
    category: categorize(parsed.data),
  });
  revalidatePath("/list");
}

export async function toggleItem(id: string, completed: boolean) {
  const supabase = await createClient();
  await supabase.from("grocery_items").update({ is_completed: completed }).eq("id", id);
  revalidatePath("/list");
}

export async function deleteItem(id: string) {
  const supabase = await createClient();
  await supabase.from("grocery_items").delete().eq("id", id);
  revalidatePath("/list");
}

export async function clearCompleted(ids: string[]) {
  if (ids.length === 0) return;
  const supabase = await createClient();
  // Delete by id (RLS-scoped) so a recipe-filtered "clear" only clears what's
  // visible, never other recipes' completed items.
  await supabase.from("grocery_items").delete().in("id", ids);
  revalidatePath("/list");
}

/**
 * Add a chosen subset of a recipe's ingredients to that recipe's own grocery
 * list. Ingredients are re-fetched by id server-side (RLS-scoped), so
 * client-supplied text is never trusted. The recipe's list is found by its
 * source_recipe_id, or created on first add and named after the recipe.
 */
export type AddToListResult = {
  listId: string;
  count: number; // newly added
  skipped: number; // already on the list, not re-added
  created: boolean;
  listName: string;
};

export async function addRecipeIngredientsToList(
  recipeId: string,
  ingredientIds: string[],
  scale: number = 1,
): Promise<AddToListResult> {
  const empty: AddToListResult = { listId: "", count: 0, skipped: 0, created: false, listName: "" };
  const supabase = await createClient();
  const user = await currentUser();
  if (!user || ingredientIds.length === 0) return empty;

  const { data: recipe } = await supabase
    .from("recipes")
    .select("title")
    .eq("id", recipeId)
    .maybeSingle();
  if (!recipe) return empty;
  const listName = recipe.title;

  // The recipe's own list — found by binding, or created and named after it.
  let target: string | undefined;
  let created = false;
  const { data: existing } = await supabase
    .from("grocery_lists")
    .select("id")
    .eq("source_recipe_id", recipeId)
    .maybeSingle();
  target = existing?.id;

  if (!target) {
    const { data: inserted, error: createErr } = await supabase
      .from("grocery_lists")
      .insert({ name: listName.slice(0, 80), source_recipe_id: recipeId })
      .select("id")
      .single();
    if (createErr) {
      // Lost a concurrent create race (the unique index rejected the second
      // insert) — the winning request already made the list, so reuse it
      // rather than dropping this request's items.
      const { data: raced } = await supabase
        .from("grocery_lists")
        .select("id")
        .eq("source_recipe_id", recipeId)
        .maybeSingle();
      target = raced?.id;
    } else {
      target = inserted?.id;
      created = true;
    }
  }
  if (!target) return { ...empty, listName };

  const { data: ingredients } = await supabase
    .from("recipe_ingredients")
    .select("id, display_text, quantity, unit, name, sort_order")
    .eq("recipe_id", recipeId)
    .in("id", ingredientIds)
    .order("sort_order", { ascending: true });
  if (!ingredients || ingredients.length === 0)
    return { listId: target, count: 0, skipped: 0, created, listName };

  // Skip ingredients already on this list, so re-adding never duplicates.
  // Match on provenance (source_ingredient_id) and, as a fallback, on the
  // rendered text — editing a recipe reinserts its ingredients with new ids,
  // which nulls the provenance FK on existing grocery rows.
  const { data: existingItems } = await supabase
    .from("grocery_items")
    .select("source_ingredient_id, display_text")
    .eq("list_id", target)
    .eq("source_recipe_id", recipeId);
  const alreadyIds = new Set(
    (existingItems ?? []).map((r) => r.source_ingredient_id).filter(Boolean),
  );
  const alreadyText = new Set((existingItems ?? []).map((r) => r.display_text));
  const displayFor = (ing: (typeof ingredients)[number]) =>
    scaleIngredientText(ing.name ?? ing.display_text, scale);
  const fresh = ingredients.filter(
    (ing) => !alreadyIds.has(ing.id) && !alreadyText.has(displayFor(ing)),
  );
  const skipped = ingredients.length - fresh.length;
  if (fresh.length === 0) return { listId: target, count: 0, skipped, created, listName };

  const base = await nextSortOrder(supabase, target);
  const rows = fresh.map((ing, i) => {
    const qty = quantityLabel(ing);
    return {
      list_id: target!,
      display_text: scaleIngredientText(ing.name ?? ing.display_text, scale),
      quantity: qty ? scaleIngredientText(qty, scale) : null,
      source_recipe_id: recipeId,
      source_ingredient_id: ing.id,
      sort_order: base + i,
      category: categorize(ing.name ?? ing.display_text),
    };
  });
  // Upsert with ignoreDuplicates: if a concurrent add already inserted the same
  // (list, ingredient), the unique index makes this a no-op rather than an error
  // or a duplicate row.
  const { error } = await supabase
    .from("grocery_items")
    .upsert(rows, { onConflict: "list_id,source_ingredient_id", ignoreDuplicates: true });
  if (error) return { listId: target, count: 0, skipped, created, listName };

  revalidatePath("/list");
  return { listId: target, count: rows.length, skipped, created, listName };
}
