import type { Client } from "@/lib/supabase/server";

export const RECIPE_IMAGES_BUCKET = "recipe-images";
const DEFAULT_SIGNED_TTL = 60 * 60; // 1 hour

/** Shelf cards lazy-load, so a card's URL may not be fetched until the user scrolls to
 *  it — possibly long after the page was rendered and signed. A generously long TTL keeps
 *  a deferred thumbnail from 404-ing on an expired URL; these are owner-scoped, private
 *  images, so a longer capability window carries no real exposure. */
export const SHELF_SIGNED_TTL = 60 * 60 * 12; // 12 hours

/** Batch-sign a set of storage paths (deduped, nulls dropped) → path → URL map. */
export async function signStoragePaths(
  supabase: Client,
  paths: Array<string | null | undefined>,
  ttl: number = DEFAULT_SIGNED_TTL,
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (unique.length === 0) return {};

  const { data } = await supabase.storage.from(RECIPE_IMAGES_BUCKET).createSignedUrls(unique, ttl);
  const map: Record<string, string> = {};
  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) map[entry.path] = entry.signedUrl;
  }
  return map;
}
