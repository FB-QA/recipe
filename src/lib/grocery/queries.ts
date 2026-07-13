import { createClient } from "@/lib/supabase/server";
import { signStoragePaths } from "@/lib/supabase/storage";
import { ALL_LISTS } from "./constants";

/** A list chip in the grocery filter bar. Recipe lists carry a cover (or a
 * title-derived gradient when the recipe has no photo); manual lists don't. */
export type GroceryList = { id: string; name: string; coverUrl: string | null; isRecipe: boolean };

export type GroceryItem = {
  id: string;
  display_text: string;
  quantity: string | null;
  is_completed: boolean;
  sort_order: number;
  category: string | null;
  list_id: string;
};

export async function getLists(): Promise<GroceryList[]> {
  const board = await getBoard();
  return board.lists;
}

export type GroceryBoardData = {
  lists: GroceryList[];
  /** The selected chip: a list id, the "all" sentinel, or null when empty. */
  activeId: string | null;
  /** Every item across all of the user's lists — the board filters client-side. */
  items: GroceryItem[];
};

export async function getBoard(requestedListId?: string): Promise<GroceryBoardData> {
  const supabase = await createClient();

  const { data: listRows } = await supabase
    .from("grocery_lists")
    .select("id, name, source_recipe_id, created_at")
    .order("created_at", { ascending: true });
  const rawLists = listRows ?? [];
  if (rawLists.length === 0) return { lists: [], activeId: null, items: [] };

  // Signed covers for recipe-bound lists (manual lists have none).
  const recipeIds = [
    ...new Set(rawLists.map((l) => l.source_recipe_id).filter((x): x is string => Boolean(x))),
  ];
  const coverByRecipe: Record<string, string | null> = {};
  if (recipeIds.length > 0) {
    const { data: recipes } = await supabase
      .from("recipes")
      .select("id, cover_image_path")
      .in("id", recipeIds);
    const covers = await signStoragePaths(
      supabase,
      (recipes ?? []).map((r) => r.cover_image_path),
    );
    for (const r of recipes ?? []) {
      coverByRecipe[r.id] = r.cover_image_path ? (covers[r.cover_image_path] ?? null) : null;
    }
  }

  const lists: GroceryList[] = rawLists.map((l) => ({
    id: l.id,
    name: l.name,
    coverUrl: l.source_recipe_id ? (coverByRecipe[l.source_recipe_id] ?? null) : null,
    isRecipe: Boolean(l.source_recipe_id),
  }));

  const { data: rows } = await supabase
    .from("grocery_items")
    .select("id, display_text, quantity, is_completed, sort_order, category, list_id")
    .in(
      "list_id",
      rawLists.map((l) => l.id),
    )
    .order("sort_order", { ascending: true });

  const activeId =
    requestedListId && lists.some((l) => l.id === requestedListId) ? requestedListId : ALL_LISTS;

  return { lists, activeId, items: rows ?? [] };
}
