import { createClient } from "@/lib/supabase/server";

const BUCKET = "recipe-images";
const SIGNED_TTL = 60 * 60;

export type GroceryList = { id: string; name: string };

export type GroceryItem = {
  id: string;
  display_text: string;
  quantity: string | null;
  is_completed: boolean;
  sort_order: number;
  category: string | null;
  sourceRecipeId: string | null;
  source: { title: string; coverUrl: string | null } | null;
};

export async function getLists(): Promise<GroceryList[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("grocery_lists")
    .select("id, name")
    .order("created_at", { ascending: true });
  return data ?? [];
}

export type GroceryBoardData = {
  lists: GroceryList[];
  activeId: string | null;
  items: GroceryItem[];
};

export async function getBoard(requestedListId?: string): Promise<GroceryBoardData> {
  const supabase = await createClient();
  const lists = await getLists();
  if (lists.length === 0) return { lists, activeId: null, items: [] };

  const activeId = lists.find((l) => l.id === requestedListId)?.id ?? lists[0].id;

  const { data: rows } = await supabase
    .from("grocery_items")
    .select("id, display_text, quantity, is_completed, sort_order, category, source_recipe_id")
    .eq("list_id", activeId)
    .order("sort_order", { ascending: true });
  const items = rows ?? [];

  // Resolve each item's source recipe (title + signed cover) for the thumbnail.
  const recipeIds = [
    ...new Set(items.map((i) => i.source_recipe_id).filter((x): x is string => Boolean(x))),
  ];
  const sourceMap: Record<string, { title: string; coverUrl: string | null }> = {};

  if (recipeIds.length > 0) {
    const { data: recipes } = await supabase
      .from("recipes")
      .select("id, title, cover_image_path")
      .in("id", recipeIds);

    const paths = [
      ...new Set(
        (recipes ?? []).map((r) => r.cover_image_path).filter((x): x is string => Boolean(x)),
      ),
    ];
    const covers: Record<string, string> = {};
    if (paths.length > 0) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL);
      for (const entry of data ?? []) {
        if (entry.signedUrl && entry.path) covers[entry.path] = entry.signedUrl;
      }
    }
    for (const r of recipes ?? []) {
      sourceMap[r.id] = {
        title: r.title,
        coverUrl: r.cover_image_path ? (covers[r.cover_image_path] ?? null) : null,
      };
    }
  }

  return {
    lists,
    activeId,
    items: items.map((i) => ({
      id: i.id,
      display_text: i.display_text,
      quantity: i.quantity,
      is_completed: i.is_completed,
      sort_order: i.sort_order,
      category: i.category,
      sourceRecipeId: i.source_recipe_id,
      source: i.source_recipe_id ? (sourceMap[i.source_recipe_id] ?? null) : null,
    })),
  };
}
