import { createClient } from "@/lib/supabase/server";
import { signStoragePaths, SHELF_SIGNED_TTL } from "@/lib/supabase/storage";
import type { Database } from "@/lib/supabase/database.types";

export type RecipeListItem = {
  id: string;
  title: string;
  servings: string | null;
  source_type: Database["public"]["Enums"]["source_type"];
  source_handle: string | null;
  is_favourite: boolean;
  tags: string[];
  coverUrl: string | null;
  thumbUrl: string | null;
  ingredientCount: number;
  cook_time: string | null;
};

export async function listRecipes(opts: { search?: string; favourite?: boolean } = {}): Promise<
  RecipeListItem[]
> {
  const supabase = await createClient();
  let query = supabase
    .from("recipes")
    .select(
      "id, title, servings, source_type, source_handle, is_favourite, tags, cover_image_path, thumb_image_path, cook_time, recipe_ingredients(count)",
    )
    .order("created_at", { ascending: false });

  if (opts.favourite) query = query.eq("is_favourite", true);
  const search = opts.search?.trim();
  if (search) query = query.ilike("title", `%${search}%`);

  const { data, error } = await query;
  // A query error must NOT degrade to an empty list: an empty shelf is a valid,
  // cacheable success, so a transient failure (an expired token, a refresh race, a
  // dropped connection) would masquerade as "no recipes yet" and stick in the
  // client router cache until a hard reload. Throw instead — the error boundary
  // shows a "Try again" that re-renders fresh. A genuinely empty shelf is `data:
  // []` with no error, and still returns [] below.
  if (error) {
    console.error("listRecipes query failed:", error.message);
    throw new Error(`listRecipes query failed: ${error.message}`);
  }
  if (!data) return [];

  const covers = await signStoragePaths(
    supabase,
    data.flatMap((r) => [r.cover_image_path, r.thumb_image_path]).filter((p): p is string => Boolean(p)),
    SHELF_SIGNED_TTL, // lazy cards may be fetched long after render — see SHELF_SIGNED_TTL
  );

  return data.map((r) => ({
    id: r.id,
    title: r.title,
    servings: r.servings,
    source_type: r.source_type,
    is_favourite: r.is_favourite,
    tags: r.tags,
    coverUrl: r.cover_image_path ? (covers[r.cover_image_path] ?? null) : null,
    thumbUrl: r.thumb_image_path ? (covers[r.thumb_image_path] ?? null) : null,
    ingredientCount: r.recipe_ingredients?.[0]?.count ?? 0,
    source_handle: r.source_handle,
    cook_time: r.cook_time,
  }));
}

export type FullRecipe = NonNullable<Awaited<ReturnType<typeof getRecipe>>>;

export async function getRecipe(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select(
      `id, title, description, servings, prep_time, cook_time, source_url, source_type, source_handle,
       calories, protein, carbs, fat, fibre, sugar, nutrition_per_serving,
       tags, is_favourite, cover_image_path, created_at,
       recipe_ingredient_groups (id, name, position, optional),
       recipe_ingredients (id, display_text, quantity, unit, name, sort_order, group_id, optional, quantity_value, quantity_min, quantity_max, preparation, alternative_group),
       recipe_steps (id, instruction, image_path, sort_order, title),
       recipe_tips (id, text, sort_order)`,
    )
    .eq("id", id)
    .maybeSingle();

  // Distinguish a genuinely-missing recipe from a transient failure. `maybeSingle`
  // returns `data: null` with no error when the row simply isn't there — that stays
  // a clean `notFound()` at the call site. A real error must throw instead, or the
  // same refresh-race/blip this PR fixes for the shelf would render a recipe as a
  // 404 "not found" rather than the "Try again" boundary.
  if (error) {
    console.error("getRecipe query failed:", error.message);
    throw new Error(`getRecipe query failed: ${error.message}`);
  }
  if (!data) return null;

  const covers = await signStoragePaths(
    supabase,
    [data.cover_image_path, ...data.recipe_steps.map((s) => s.image_path)].filter(
      (p): p is string => Boolean(p),
    ),
  );

  const ingredients = [...data.recipe_ingredients].sort((a, b) => a.sort_order - b.sort_order);

  // Build the display sections: declared groups in order, each with its
  // ingredients; ingredients with no group (legacy/manual) fall into a single
  // unnamed trailing group so nothing is ever lost.
  const groupsSorted = [...data.recipe_ingredient_groups].sort((a, b) => a.position - b.position);
  const grouped = groupsSorted.map((g) => ({
    id: g.id,
    name: g.name,
    optional: g.optional,
    ingredients: ingredients.filter((i) => i.group_id === g.id),
  }));
  const orphans = ingredients.filter((i) => !i.group_id);
  const ingredientGroups =
    orphans.length > 0
      ? [...grouped, { id: "ungrouped", name: null, optional: false, ingredients: orphans }]
      : grouped;

  return {
    ...data,
    coverUrl: data.cover_image_path ? (covers[data.cover_image_path] ?? null) : null,
    ingredients,
    ingredientGroups: ingredientGroups.filter((g) => g.ingredients.length > 0),
    steps: [...data.recipe_steps]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ ...s, imageUrl: s.image_path ? (covers[s.image_path] ?? null) : null })),
    tips: [...data.recipe_tips].sort((a, b) => a.sort_order - b.sort_order),
  };
}

export async function countRecipes(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase.from("recipes").select("id", { count: "exact", head: true });
  // Same rule as listRecipes: a failed count must not silently read as zero, which
  // would render "your shelf is empty" over a shelf that isn't.
  if (error) {
    console.error("countRecipes query failed:", error.message);
    throw new Error(`countRecipes query failed: ${error.message}`);
  }
  return count ?? 0;
}
