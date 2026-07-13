"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { categorize } from "./categorize";

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

export async function clearCompleted(listId: string) {
  const supabase = await createClient();
  await supabase.from("grocery_items").delete().eq("list_id", listId).eq("is_completed", true);
  revalidatePath("/list");
}

/**
 * Add every ingredient from a recipe to a list. Creates a "This Week" list on
 * first use. Returns the list id so the caller can jump there.
 */
export async function addRecipeToList(recipeId: string): Promise<{ listId: string; count: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { listId: "", count: 0 };

  // Resolve (or create) the target list.
  const { data: lists } = await supabase
    .from("grocery_lists")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);
  let listId = lists?.[0]?.id;
  if (!listId) {
    const { data } = await supabase
      .from("grocery_lists")
      .insert({ name: "This Week" })
      .select("id")
      .single();
    listId = data?.id;
  }
  if (!listId) return { listId: "", count: 0 };

  const { data: ingredients } = await supabase
    .from("recipe_ingredients")
    .select("display_text, quantity, unit, name, sort_order")
    .eq("recipe_id", recipeId)
    .order("sort_order", { ascending: true });
  if (!ingredients || ingredients.length === 0) return { listId, count: 0 };

  const base = await nextSortOrder(supabase, listId);
  const rows = ingredients.map((ing, i) => ({
    list_id: listId!,
    display_text: ing.name ?? ing.display_text,
    quantity: [ing.quantity, ing.unit].filter(Boolean).join(" ") || null,
    source_recipe_id: recipeId,
    sort_order: base + i,
    category: categorize(ing.name ?? ing.display_text),
  }));
  await supabase.from("grocery_items").insert(rows);

  revalidatePath("/list");
  return { listId, count: rows.length };
}

/**
 * Add a chosen subset of a recipe's ingredients to a list. Ingredients are
 * re-fetched by id server-side (RLS-scoped), so client-supplied text is never
 * trusted. Creates "This Week" if the user has no list yet.
 */
export async function addRecipeIngredientsToList(
  recipeId: string,
  ingredientIds: string[],
  listId?: string,
): Promise<{ listId: string; count: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || ingredientIds.length === 0) return { listId: listId ?? "", count: 0 };

  // Resolve the target list: a verified-owned one, the first list, or a new one.
  let target: string | undefined;
  if (listId) {
    const { data } = await supabase.from("grocery_lists").select("id").eq("id", listId).maybeSingle();
    target = data?.id;
  }
  if (!target) {
    const { data: lists } = await supabase
      .from("grocery_lists")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1);
    target = lists?.[0]?.id;
  }
  if (!target) {
    const { data } = await supabase.from("grocery_lists").insert({ name: "This Week" }).select("id").single();
    target = data?.id;
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
  const rows = ingredients.map((ing, i) => ({
    list_id: target!,
    display_text: ing.name ?? ing.display_text,
    quantity: [ing.quantity, ing.unit].filter(Boolean).join(" ") || null,
    source_recipe_id: recipeId,
    sort_order: base + i,
    category: categorize(ing.name ?? ing.display_text),
  }));
  await supabase.from("grocery_items").insert(rows);

  revalidatePath("/list");
  return { listId: target, count: rows.length };
}
