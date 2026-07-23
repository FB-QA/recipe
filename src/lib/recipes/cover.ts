import { optimizeRenditionsFromUrl, type CoverRenditions } from "@/lib/images/optimize";
import { RECIPE_IMAGES_BUCKET as BUCKET } from "@/lib/supabase/storage";

/** The stable storage path for a recipe's full cover — one webp per recipe, upserted. */
export function recipeCoverPath(userId: string, recipeId: string): string {
  return `${userId}/${recipeId}/cover.webp`;
}

/** The stable storage path for a recipe's shelf thumbnail, beside the cover. */
export function recipeThumbPath(userId: string, recipeId: string): string {
  return `${userId}/${recipeId}/thumb.webp`;
}

/** What landed in storage: the cover always, the thumb when its (best-effort) upload
 *  succeeded. A null thumb means the shelf falls back to the cover — never a broken image. */
export interface StoredCover {
  cover: string;
  thumb: string | null;
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

const WEBP = { contentType: "image/webp", upsert: true } as const;

/** Upload both renditions to their stable paths. The cover is required — a failure
 *  there fails the whole operation. The thumb is best-effort: a hiccup there must never
 *  cost the cover, so it degrades to a null thumb (the shelf then serves the cover). */
export async function storeRenditions(
  storage: StorageLike,
  userId: string,
  recipeId: string,
  renditions: CoverRenditions,
): Promise<StoredCover | null> {
  const coverPath = recipeCoverPath(userId, recipeId);
  const thumbPath = recipeThumbPath(userId, recipeId);
  const [coverRes, thumbRes] = await Promise.all([
    storage.from(BUCKET).upload(coverPath, renditions.cover, WEBP),
    storage.from(BUCKET).upload(thumbPath, renditions.thumb, WEBP),
  ]);
  if (coverRes.error) return null;
  return { cover: coverPath, thumb: thumbRes.error ? null : thumbPath };
}

/**
 * Download a cover image from a URL, optimise it to both renditions, and upsert them at
 * the recipe's stable paths. Returns the stored paths, or null if the fetch/optimise or
 * the cover upload failed. Single home for the download → optimise → upsert sequence,
 * shared by the save action (the initial cover) and the deferred cover-enrichment
 * background update (swapping the play-button composite for Apify's clean image on an
 * already-saved recipe). The paths never change, so upsert overwrites in place.
 */
export async function storeCoverFromUrl(
  storage: StorageLike,
  userId: string,
  recipeId: string,
  url: string,
): Promise<StoredCover | null> {
  const renditions = await optimizeRenditionsFromUrl(url);
  if (!renditions) return null;
  return storeRenditions(storage, userId, recipeId, renditions);
}
