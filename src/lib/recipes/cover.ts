import { optimizeFromUrl } from "@/lib/images/optimize";
import { RECIPE_IMAGES_BUCKET as BUCKET } from "@/lib/supabase/storage";

/** The stable storage path for a recipe's cover — one webp per recipe, upserted. */
export function recipeCoverPath(userId: string, recipeId: string): string {
  return `${userId}/${recipeId}/cover.webp`;
}

/** Minimal shape of the Supabase storage client — satisfied by both the typed
 *  request client and the service-role client used off the request path. */
interface StorageLike {
  from: (bucket: string) => {
    upload: (
      path: string,
      body: Buffer,
      opts: { contentType: string; upsert: boolean },
    ) => Promise<{ error: unknown }>;
  };
}

/**
 * Download a cover image from a URL, optimise it to webp, and upsert it at the
 * recipe's stable cover path. Returns the path, or null if the fetch/optimise/upload
 * failed. Single home for the download → optimise → upsert sequence, shared by the
 * save action (the initial cover) and the deferred cover-enrichment background update
 * (swapping the play-button composite for Apify's clean image on an already-saved
 * recipe). The path never changes, so upsert overwrites in place — no row update.
 */
export async function storeCoverFromUrl(
  storage: StorageLike,
  userId: string,
  recipeId: string,
  url: string,
): Promise<string | null> {
  const optimized = await optimizeFromUrl(url);
  if (!optimized) return null;
  const path = recipeCoverPath(userId, recipeId);
  const { error } = await storage
    .from(BUCKET)
    .upload(path, optimized, { contentType: "image/webp", upsert: true });
  return error ? null : path;
}
