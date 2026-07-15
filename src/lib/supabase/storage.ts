import type { Client } from "@/lib/supabase/server";

export const RECIPE_IMAGES_BUCKET = "recipe-images";
const DEFAULT_SIGNED_TTL = 60 * 60; // 1 hour

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
