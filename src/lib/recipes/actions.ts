"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, type Client } from "@/lib/supabase/server";
import { currentUser, SIGNED_OUT_ERROR } from "@/lib/auth/session";
import { parseRecipePayload, type RecipeInput } from "./schema";
import { resolveGroups, flattenIngredients } from "./groups";
import { markImportSaved } from "@/lib/import/store";
import { optimizeCover } from "@/lib/images/optimize";
import { RECIPE_IMAGES_BUCKET as BUCKET } from "@/lib/supabase/storage";
import { storeCoverFromUrl } from "./cover";

export type RecipeFormState = { error?: string } | { ok: true; id: string } | undefined;

function readPayload(formData: FormData) {
  try {
    return parseRecipePayload(JSON.parse((formData.get("payload") as string) || "{}"));
  } catch {
    return { success: false, error: { issues: [{ message: "The form data was malformed." }] } } as const;
  }
}

async function uploadCover(supabase: Client, userId: string, recipeId: string, file: File) {
  const optimized = await optimizeCover(await file.arrayBuffer());
  const path = `${userId}/${recipeId}/cover.webp`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, optimized, { contentType: "image/webp", upsert: true });
  if (error) throw new Error("upload failed");
  return path;
}

const uploadCoverFromUrl = (supabase: Client, userId: string, recipeId: string, url: string) =>
  storeCoverFromUrl(supabase.storage, userId, recipeId, url);

async function removeRecipeFolder(supabase: Client, userId: string, recipeId: string) {
  const prefix = `${userId}/${recipeId}`;
  const { data } = await supabase.storage.from(BUCKET).list(prefix);
  if (data && data.length > 0) {
    await supabase.storage.from(BUCKET).remove(data.map((f) => `${prefix}/${f.name}`));
  }
}

/** Replace a recipe's children — groups, ingredients, steps, tips — in one
 *  wholesale replace (W6). Returns false if any delete/insert errored, so the
 *  caller can surface the failure rather than redirect as if it succeeded.
 *  Ingredient sections, ranges, optionals, alternatives and step titles all
 *  round-trip faithfully; a flat manual recipe becomes one unnamed group. */
async function replaceChildren(supabase: Client, recipeId: string, input: RecipeInput): Promise<boolean> {
  // Deleting the groups cascades their ingredients (FK ON DELETE CASCADE);
  // deleting recipe_ingredients by recipe_id also clears any groupless rows.
  const deletes = await Promise.all([
    supabase.from("recipe_ingredient_groups").delete().eq("recipe_id", recipeId),
    supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId),
    supabase.from("recipe_steps").delete().eq("recipe_id", recipeId),
    supabase.from("recipe_tips").delete().eq("recipe_id", recipeId),
  ]);
  if (deletes.some((r) => r.error)) return false;

  const groups = resolveGroups(input);

  // Insert groups first to obtain their ids, then map each ingredient to its
  // group by position. Groups keep their declared order.
  let groupIds: string[] = [];
  if (groups.length > 0) {
    const { data, error } = await supabase
      .from("recipe_ingredient_groups")
      .insert(groups.map((g, i) => ({ recipe_id: recipeId, name: g.name, optional: g.optional, position: i })))
      .select("id");
    if (error || !data) return false;
    groupIds = data.map((g) => g.id);
  }

  const ingredientRows = flattenIngredients(groups).map((r) => ({
    recipe_id: recipeId,
    group_id: groupIds[r.groupIndex] ?? null,
    display_text: r.display_text,
    quantity: r.quantity,
    unit: r.unit,
    name: r.name,
    quantity_value: r.quantity_value,
    quantity_min: r.quantity_min,
    quantity_max: r.quantity_max,
    preparation: r.preparation,
    optional: r.optional,
    alternative_group: r.alternative_group,
    sort_order: r.sort_order,
  }));
  const steps = input.steps.map((s, i) => ({
    recipe_id: recipeId,
    instruction: s.instruction,
    title: s.title ?? null,
    sort_order: i,
  }));
  const tips = input.tips.map((t, i) => ({ recipe_id: recipeId, text: t, sort_order: i }));

  const inserts = await Promise.all([
    ingredientRows.length ? supabase.from("recipe_ingredients").insert(ingredientRows) : null,
    steps.length ? supabase.from("recipe_steps").insert(steps) : null,
    tips.length ? supabase.from("recipe_tips").insert(tips) : null,
  ]);
  return !inserts.some((r) => r?.error);
}

export async function createRecipe(
  _prev: RecipeFormState,
  formData: FormData,
): Promise<RecipeFormState> {
  const parsed = readPayload(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const input = parsed.data;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) return { error: SIGNED_OUT_ERROR };

  // Recheck the source URL at save time (not just at import) so a second tab
  // that already imported the same link lands on the existing recipe instead
  // of inserting a duplicate.
  if (input.source_url) {
    const { data: dupe } = await supabase
      .from("recipes")
      .select("id")
      .eq("source_url", input.source_url)
      .limit(1)
      .maybeSingle();
    if (dupe) return { ok: true, id: dupe.id };
  }

  const { data: recipe, error } = await supabase
    .from("recipes")
    .insert({
      user_id: user.id,
      title: input.title,
      description: input.description,
      servings: input.servings,
      prep_time: input.prep_time,
      cook_time: input.cook_time,
      calories: input.calories,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      fibre: input.fibre,
      sugar: input.sugar,
      nutrition_per_serving: input.nutrition_per_serving ?? null,
      source_url: input.source_url,
      source_type: input.source_type,
      source_handle: input.source_handle,
      tags: input.tags,
    })
    .select("id")
    .single();
  if (error || !recipe) return { error: "Couldn't save the recipe. Try again." };

  const cover = formData.get("cover");
  const importCoverUrl = String(formData.get("importCoverUrl") ?? "").trim();
  try {
    let path: string | null = null;
    if (cover instanceof File && cover.size > 0) {
      path = await uploadCover(supabase, user.id, recipe.id, cover);
    } else if (importCoverUrl) {
      path = await uploadCoverFromUrl(supabase, user.id, recipe.id, importCoverUrl);
    }
    if (path) await supabase.from("recipes").update({ cover_image_path: path }).eq("id", recipe.id);
  } catch {
    // Non-fatal: the recipe is saved; the cover just didn't stick.
  }

  const saved = await replaceChildren(supabase, recipe.id, input);
  if (!saved) return { error: "Couldn't save all of the recipe — open it and try again." };

  // If this recipe came from confirming an import draft, link it back and move
  // the import row to `saved` (audit trail + accurate dashboard state). Best-effort.
  const importId = String(formData.get("importId") ?? "").trim();
  if (importId) {
    try {
      // `importCoverUrl` is non-empty only when the user kept the imported cover
      // (the form clears it for replace/remove) — the signal the deferred cover
      // enrichment uses to know it may still update the saved recipe's cover.
      await markImportSaved(importId, recipe.id, user.id, Boolean(importCoverUrl));
    } catch {
      // Non-fatal: the recipe is saved; only the import→recipe link didn't stick.
    }
  }

  revalidatePath("/");
  // Return the id (not redirect) so the client can toast, animate the drawer
  // closed, then navigate — navigation must never be what closes a drawer.
  return { ok: true, id: recipe.id };
}

export async function updateRecipe(
  id: string,
  _prev: RecipeFormState,
  formData: FormData,
): Promise<RecipeFormState> {
  const parsed = readPayload(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const input = parsed.data;

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) return { error: SIGNED_OUT_ERROR };

  const { error } = await supabase
    .from("recipes")
    .update({
      title: input.title,
      description: input.description,
      servings: input.servings,
      prep_time: input.prep_time,
      cook_time: input.cook_time,
      calories: input.calories,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      fibre: input.fibre,
      sugar: input.sugar,
      nutrition_per_serving: input.nutrition_per_serving ?? null,
      source_url: input.source_url,
      tags: input.tags,
    })
    .eq("id", id);
  if (error) return { error: "Couldn't save your changes. Try again." };

  const coverAction = formData.get("coverAction");
  const cover = formData.get("cover");
  if (coverAction === "remove") {
    await removeRecipeFolder(supabase, user.id, id);
    await supabase.from("recipes").update({ cover_image_path: null }).eq("id", id);
  } else if (cover instanceof File && cover.size > 0) {
    try {
      const path = await uploadCover(supabase, user.id, id, cover);
      await supabase.from("recipes").update({ cover_image_path: path }).eq("id", id);
    } catch {
      /* non-fatal */
    }
  }

  const saved = await replaceChildren(supabase, id, input);
  if (!saved) return { error: "Couldn't save your changes in full — try again." };

  revalidatePath("/");
  revalidatePath(`/recipes/${id}`);
  revalidatePath("/list"); // the grocery chip name mirrors the recipe title
  return { ok: true, id };
}

export async function deleteRecipe(id: string): Promise<void> {
  const supabase = await createClient();
  const user = await currentUser();
  if (user) {
    await removeRecipeFolder(supabase, user.id, id);
  }
  await supabase.from("recipes").delete().eq("id", id);
  revalidatePath("/");
  redirect("/");
}

export async function toggleFavourite(id: string, next: boolean): Promise<void> {
  const supabase = await createClient();
  await supabase.from("recipes").update({ is_favourite: next }).eq("id", id);
  revalidatePath("/");
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);
}
