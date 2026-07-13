"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { categorize } from "./categorize";
import { scaleIngredientText } from "@/lib/recipes/scale";
import { quantityLabel } from "@/lib/recipes/ingredient";

async function nextSortOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listId: string,
): Promise<number> {
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
  revalidatePath("/list");
  redirect("/list");
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
export async function addRecipeIngredientsToList(
  recipeId: string,
  ingredientIds: string[],
  scale: number = 1,
): Promise<{ listId: string; count: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || ingredientIds.length === 0) return { listId: "", count: 0 };

  // The recipe's own list — found by binding, or created and named after it.
  let target: string | undefined;
  const { data: existing } = await supabase
    .from("grocery_lists")
    .select("id")
    .eq("source_recipe_id", recipeId)
    .maybeSingle();
  target = existing?.id;

  if (!target) {
    const { data: recipe } = await supabase
      .from("recipes")
      .select("title")
      .eq("id", recipeId)
      .maybeSingle();
    if (!recipe) return { listId: "", count: 0 };
    const { data: created, error: createErr } = await supabase
      .from("grocery_lists")
      .insert({ name: recipe.title.slice(0, 80), source_recipe_id: recipeId })
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
      target = created?.id;
    }
  }
  if (!target) return { listId: "", count: 0 };

  const { data: ingredients } = await supabase
    .from("recipe_ingredients")
    .select("display_text, quantity, unit, name, sort_order")
    .eq("recipe_id", recipeId)
    .in("id", ingredientIds)
    .order("sort_order", { ascending: true });
  if (!ingredients || ingredients.length === 0) return { listId: target, count: 0 };

  const base = await nextSortOrder(supabase, target);
  const rows = ingredients.map((ing, i) => {
    const qty = quantityLabel(ing);
    return {
      list_id: target!,
      display_text: scaleIngredientText(ing.name ?? ing.display_text, scale),
      quantity: qty ? scaleIngredientText(qty, scale) : null,
      source_recipe_id: recipeId,
      sort_order: base + i,
      category: categorize(ing.name ?? ing.display_text),
    };
  });
  const { error } = await supabase.from("grocery_items").insert(rows);
  if (error) return { listId: target, count: 0 };

  revalidatePath("/list");
  return { listId: target, count: rows.length };
}
