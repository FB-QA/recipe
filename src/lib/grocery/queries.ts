import { createClient } from "@/lib/supabase/server";

export type GroceryList = { id: string; name: string };
export type GroceryItem = {
  id: string;
  display_text: string;
  quantity: string | null;
  is_completed: boolean;
  sort_order: number;
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
  const { data: items } = await supabase
    .from("grocery_items")
    .select("id, display_text, quantity, is_completed, sort_order")
    .eq("list_id", activeId)
    .order("sort_order", { ascending: true });

  return { lists, activeId, items: items ?? [] };
}
