import { optimizeRenditionsFromUrl, optimizeThumb, type CoverRenditions } from "@/lib/images/optimize";
import { RECIPE_IMAGES_BUCKET as BUCKET } from "@/lib/supabase/storage";
import type { Client } from "@/lib/supabase/server";

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
 *  cost the cover, so it degrades to a null thumb (the shelf then serves the cover).
 *
 *  Cover FIRST, then thumb — deliberately sequential, not concurrent. If the cover upload
 *  fails we must not have already overwritten the stable `thumb.webp`, or a caller that
 *  discards the null result would leave the row pointing at the old cover while the shelf
 *  shows the new thumb — cover and card disagreeing. Uploading the cover first means a
 *  cover failure leaves BOTH stable objects untouched. */
export async function storeRenditions(
  storage: StorageLike,
  userId: string,
  recipeId: string,
  renditions: CoverRenditions,
): Promise<StoredCover | null> {
  const coverPath = recipeCoverPath(userId, recipeId);
  const coverRes = await storage.from(BUCKET).upload(coverPath, renditions.cover, WEBP);
  if (coverRes.error) return null;
  const thumbPath = recipeThumbPath(userId, recipeId);
  const thumbRes = await storage.from(BUCKET).upload(thumbPath, renditions.thumb, WEBP);
  return { cover: coverPath, thumb: thumbRes.error ? null : thumbPath };
}

/** Generate a thumb from an already-stored cover's bytes and upsert it at the recipe's
 *  stable thumb path. For backfilling a recipe that predates thumbnails — only the
 *  smaller size is missing, so the full cover is reused rather than re-fetched. Returns
 *  the thumb path, or null if the upload failed. */
export async function backfillThumb(
  storage: StorageLike,
  userId: string,
  recipeId: string,
  coverBytes: ArrayBuffer | Buffer,
): Promise<string | null> {
  const thumb = await optimizeThumb(coverBytes);
  const thumbPath = recipeThumbPath(userId, recipeId);
  const { error } = await storage.from(BUCKET).upload(thumbPath, thumb, WEBP);
  return error ? null : thumbPath;
}

/**
 * Backfill the shelf thumbnail for a recipe that predates thumbnails — a cover on file
 * but no `thumb_image_path`. The thumb is generated from the STORED cover (not the
 * original), so it's cheap and needs no re-upload of the source. Best-effort and
 * idempotent: skipped once a thumb exists, so re-saving an already-migrated recipe costs
 * only one small read. Runs in the owner's auth context, so RLS on both the row and the
 * storage folder holds. Extracted here (rather than left inline in the server action) so
 * its branches are unit-testable.
 */
export async function backfillMissingThumb(
  supabase: Client,
  userId: string,
  recipeId: string,
): Promise<void> {
  const { data } = await supabase
    .from("recipes")
    .select("cover_image_path, thumb_image_path")
    .eq("id", recipeId)
    .maybeSingle();
  if (!data?.cover_image_path || data.thumb_image_path) return; // nothing to backfill
  try {
    const { data: file } = await supabase.storage.from(BUCKET).download(data.cover_image_path);
    if (!file) return;
    const thumbPath = await backfillThumb(supabase.storage, userId, recipeId, await file.arrayBuffer());
    if (thumbPath) await supabase.from("recipes").update({ thumb_image_path: thumbPath }).eq("id", recipeId);
  } catch {
    // Best-effort: the shelf falls back to the full cover until the next save.
  }
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
