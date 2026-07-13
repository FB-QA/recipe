import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const BUCKET = "recipe-images";
const SIGNED_TTL = 60 * 60; // 1 hour

type Client = SupabaseClient<Database>;

async function signPaths(supabase: Client, paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(unique, SIGNED_TTL);
  const map: Record<string, string> = {};
  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) map[entry.path] = entry.signedUrl;
  }
  return map;
}

export type RecipeListItem = {
  id: string;
  title: string;
  servings: string | null;
  source_type: Database["public"]["Enums"]["source_type"];
  source_handle: string | null;
  is_favourite: boolean;
  tags: string[];
  coverUrl: string | null;
  ingredientCount: number;
};

export async function listRecipes(opts: { search?: string; favourite?: boolean } = {}): Promise<
  RecipeListItem[]
> {
  const supabase = await createClient();
  let query = supabase
    .from("recipes")
    .select(
      "id, title, servings, source_type, source_handle, is_favourite, tags, cover_image_path, recipe_ingredients(count)",
    )
    .order("created_at", { ascending: false });

  if (opts.favourite) query = query.eq("is_favourite", true);
  const search = opts.search?.trim();
  if (search) query = query.ilike("title", `%${search}%`);

  const { data, error } = await query;
  if (error || !data) return [];

  const covers = await signPaths(
    supabase,
    data.map((r) => r.cover_image_path).filter((p): p is string => Boolean(p)),
  );

  return data.map((r) => ({
    id: r.id,
    title: r.title,
    servings: r.servings,
    source_type: r.source_type,
    is_favourite: r.is_favourite,
    tags: r.tags,
    coverUrl: r.cover_image_path ? (covers[r.cover_image_path] ?? null) : null,
    ingredientCount: r.recipe_ingredients?.[0]?.count ?? 0,
    source_handle: r.source_handle,
  }));
}

export type FullRecipe = NonNullable<Awaited<ReturnType<typeof getRecipe>>>;

export async function getRecipe(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select(
      `id, title, description, servings, prep_time, cook_time, source_url, source_type, source_handle,
       tags, is_favourite, cover_image_path, created_at,
       recipe_ingredients (id, display_text, quantity, unit, name, sort_order),
       recipe_steps (id, instruction, image_path, sort_order),
       recipe_tips (id, text, sort_order)`,
    )
    .eq("id", id)
    .single();

  if (error || !data) return null;

  const covers = await signPaths(
    supabase,
    [data.cover_image_path, ...data.recipe_steps.map((s) => s.image_path)].filter(
      (p): p is string => Boolean(p),
    ),
  );

  return {
    ...data,
    coverUrl: data.cover_image_path ? (covers[data.cover_image_path] ?? null) : null,
    ingredients: [...data.recipe_ingredients].sort((a, b) => a.sort_order - b.sort_order),
    steps: [...data.recipe_steps]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ ...s, imageUrl: s.image_path ? (covers[s.image_path] ?? null) : null })),
    tips: [...data.recipe_tips].sort((a, b) => a.sort_order - b.sort_order),
  };
}

export async function countRecipes(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("recipes").select("id", { count: "exact", head: true });
  return count ?? 0;
}
