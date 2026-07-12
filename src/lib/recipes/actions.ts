"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { parseRecipePayload, type RecipeInput } from "./schema";
import { optimizeCover, optimizeFromUrl } from "@/lib/images/optimize";

const BUCKET = "recipe-images";
type Client = SupabaseClient<Database>;

export type RecipeFormState = { error?: string } | undefined;

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

async function uploadCoverFromUrl(supabase: Client, userId: string, recipeId: string, url: string) {
  const optimized = await optimizeFromUrl(url);
  if (!optimized) return null;
  const path = `${userId}/${recipeId}/cover.webp`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, optimized, { contentType: "image/webp", upsert: true });
  return error ? null : path;
}

async function removeRecipeFolder(supabase: Client, userId: string, recipeId: string) {
  const prefix = `${userId}/${recipeId}`;
  const { data } = await supabase.storage.from(BUCKET).list(prefix);
  if (data && data.length > 0) {
    await supabase.storage.from(BUCKET).remove(data.map((f) => `${prefix}/${f.name}`));
  }
}

async function replaceChildren(supabase: Client, recipeId: string, input: RecipeInput) {
  await Promise.all([
    supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId),
    supabase.from("recipe_steps").delete().eq("recipe_id", recipeId),
    supabase.from("recipe_tips").delete().eq("recipe_id", recipeId),
  ]);

  const ingredients = input.ingredients.map((ing, i) => ({ recipe_id: recipeId, ...ing, sort_order: i }));
  const steps = input.steps.map((s, i) => ({ recipe_id: recipeId, instruction: s.instruction, sort_order: i }));
  const tips = input.tips.map((t, i) => ({ recipe_id: recipeId, text: t, sort_order: i }));

  await Promise.all([
    ingredients.length ? supabase.from("recipe_ingredients").insert(ingredients) : Promise.resolve(),
    steps.length ? supabase.from("recipe_steps").insert(steps) : Promise.resolve(),
    tips.length ? supabase.from("recipe_tips").insert(tips) : Promise.resolve(),
  ]);
}

export async function createRecipe(
  _prev: RecipeFormState,
  formData: FormData,
): Promise<RecipeFormState> {
  const parsed = readPayload(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const input = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You've been signed out — log in and try again." };

  const { data: recipe, error } = await supabase
    .from("recipes")
    .insert({
      user_id: user.id,
      title: input.title,
      description: input.description,
      servings: input.servings,
      prep_time: input.prep_time,
      cook_time: input.cook_time,
      source_url: input.source_url,
      source_type: input.source_type,
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

  await replaceChildren(supabase, recipe.id, input);

  revalidatePath("/");
  revalidatePath("/recipes");
  redirect(`/recipes/${recipe.id}`);
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You've been signed out — log in and try again." };

  const { error } = await supabase
    .from("recipes")
    .update({
      title: input.title,
      description: input.description,
      servings: input.servings,
      prep_time: input.prep_time,
      cook_time: input.cook_time,
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

  await replaceChildren(supabase, id, input);

  revalidatePath("/");
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);
  redirect(`/recipes/${id}`);
}

export async function deleteRecipe(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await removeRecipeFolder(supabase, user.id, id);
  }
  await supabase.from("recipes").delete().eq("id", id);
  revalidatePath("/");
  revalidatePath("/recipes");
  redirect("/recipes");
}

export async function toggleFavourite(id: string, next: boolean): Promise<void> {
  const supabase = await createClient();
  await supabase.from("recipes").update({ is_favourite: next }).eq("id", id);
  revalidatePath("/");
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);
}
