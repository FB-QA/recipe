"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { currentUser, SIGNED_OUT_ERROR } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/database.types";
import { parseRecipePayload, type RecipeInput } from "./schema";
import { swapCover } from "./cover";
import { optimizeFromUrl } from "@/lib/images/optimize";
import { coverImagePath, coverFolder } from "@/lib/images/paths";
import { validateStoredImage } from "@/lib/images/validate";
import { RECIPE_IMAGES_BUCKET as BUCKET } from "@/lib/supabase/storage";

type Client = SupabaseClient<Database>;

export type RecipeFormState =
  | { error?: string }
  | { ok: true; id: string; coverWarning?: string }
  | undefined;

function readPayload(formData: FormData) {
  try {
    return parseRecipePayload(JSON.parse((formData.get("payload") as string) || "{}"));
  } catch {
    return { success: false, error: { issues: [{ message: "The form data was malformed." }] } } as const;
  }
}

async function uploadCover(supabase: Client, userId: string, recipeId: string, file: File) {
  // The client has already compressed to WebP; the server does NOT re-process it
  // (that server-side sharp step was the silent point of failure). It validates
  // the bytes it's handed — never trust the client — and stores them under a
  // fresh uuid so a replaced cover always gets a new URL.
  const check = validateStoredImage({ type: file.type, size: file.size });
  if (!check.ok) throw new Error(check.error);
  const path = coverImagePath(userId, recipeId, crypto.randomUUID());
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("upload failed");
  return path;
}

async function uploadCoverFromUrl(supabase: Client, userId: string, recipeId: string, url: string) {
  // Import covers come from a remote page, so they're still fetched + optimised
  // server-side (sharp) — there's no client image to compress in this path.
  const optimized = await optimizeFromUrl(url);
  if (!optimized) return null;
  const path = coverImagePath(userId, recipeId, crypto.randomUUID());
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, optimized, { contentType: "image/webp", upsert: false });
  return error ? null : path;
}

/** Remove a recipe's stored images: enumerate the cover folder (current per-uuid
 *  layout) and remove its files, plus an explicit path — which also clears covers
 *  saved under the older {user}/{recipe}/cover.webp layout that predate the uuid
 *  structure. Only the cover subfolder is listed (V1 stores nothing else); a new
 *  media type must be added here — Supabase list() does not recurse. */
async function removeRecipeMedia(
  supabase: Client,
  userId: string,
  recipeId: string,
  explicitPath?: string | null,
) {
  const folder = coverFolder(userId, recipeId);
  const { data } = await supabase.storage.from(BUCKET).list(folder);
  const paths = (data ?? []).map((f) => `${folder}/${f.name}`);
  if (explicitPath && !paths.includes(explicitPath)) paths.push(explicitPath);
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
}

/** Replace a recipe's children. Returns false if any delete/insert errored, so
 *  the caller can surface the failure rather than redirect as if it succeeded. */
async function replaceChildren(supabase: Client, recipeId: string, input: RecipeInput): Promise<boolean> {
  const deletes = await Promise.all([
    supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId),
    supabase.from("recipe_steps").delete().eq("recipe_id", recipeId),
    supabase.from("recipe_tips").delete().eq("recipe_id", recipeId),
  ]);
  if (deletes.some((r) => r.error)) return false;

  const ingredients = input.ingredients.map((ing, i) => ({ recipe_id: recipeId, ...ing, sort_order: i }));
  const steps = input.steps.map((s, i) => ({ recipe_id: recipeId, instruction: s.instruction, sort_order: i }));
  const tips = input.tips.map((t, i) => ({ recipe_id: recipeId, text: t, sort_order: i }));

  const inserts = await Promise.all([
    ingredients.length ? supabase.from("recipe_ingredients").insert(ingredients) : null,
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
  let coverWarning: string | undefined;
  try {
    let path: string | null = null;
    if (cover instanceof File && cover.size > 0) {
      path = await uploadCover(supabase, user.id, recipe.id, cover);
    } else if (importCoverUrl) {
      path = await uploadCoverFromUrl(supabase, user.id, recipe.id, importCoverUrl);
    }
    if (path) await supabase.from("recipes").update({ cover_image_path: path }).eq("id", recipe.id);
  } catch {
    // The cover is optional, so a failure doesn't sink the save — but it is NOT
    // swallowed: the caller surfaces this so the user knows the photo didn't land.
    coverWarning = "Recipe saved, but the photo didn't upload. Open it to add one.";
  }

  const saved = await replaceChildren(supabase, recipe.id, input);
  if (!saved) return { error: "Couldn't save all of the recipe — open it and try again." };

  revalidatePath("/");
  // Return the id (not redirect) so the client can toast, animate the drawer
  // closed, then navigate — navigation must never be what closes a drawer.
  return { ok: true, id: recipe.id, coverWarning };
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
      source_url: input.source_url,
      tags: input.tags,
    })
    .eq("id", id);
  if (error) return { error: "Couldn't save your changes. Try again." };

  const coverAction = formData.get("coverAction");
  const cover = formData.get("cover");
  const { data: current } = await supabase
    .from("recipes")
    .select("cover_image_path")
    .eq("id", id)
    .single();
  const oldPath = current?.cover_image_path ?? null;

  if (coverAction === "remove") {
    // Null the pointer FIRST and confirm it — only then remove the files. If the
    // DB write fails we must not delete a file the recipe still points at.
    const { error: clearError } = await supabase
      .from("recipes")
      .update({ cover_image_path: null })
      .eq("id", id);
    if (clearError) return { error: "Couldn't remove the photo. Try again." };
    await removeRecipeMedia(supabase, user.id, id, oldPath);
  } else if (cover instanceof File && cover.size > 0) {
    // Upload the new image FIRST, point the recipe at it, and only THEN delete
    // the old one — a failed upload OR a failed re-point must never leave the
    // recipe pointing at a file that no longer exists. swapCover enforces that
    // order and is unit-tested.
    let path: string;
    try {
      path = await uploadCover(supabase, user.id, id, cover);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "The photo couldn't be uploaded." };
    }
    const swap = await swapCover(
      {
        repoint: async (p) => {
          const { error } = await supabase
            .from("recipes")
            .update({ cover_image_path: p })
            .eq("id", id);
          return !error;
        },
        removeFile: async (p) => {
          await supabase.storage.from(BUCKET).remove([p]);
        },
      },
      path,
      oldPath,
    );
    if (!swap.ok) return { error: "Couldn't update the photo. Try again." };
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
    const { data: current } = await supabase
      .from("recipes")
      .select("cover_image_path")
      .eq("id", id)
      .single();
    await removeRecipeMedia(supabase, user.id, id, current?.cover_image_path ?? null);
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
