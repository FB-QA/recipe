import sharp from "sharp";
import { BROWSER_USER_AGENT } from "@/lib/http";
import { safeFetch, readCapped } from "@/lib/safe-fetch";

// Two renditions from one source: a full cover for the recipe-detail hero, and a
// small thumb for the shelf grid — where a card shows the image at a fraction of the
// hero's size, so serving the full cover there is pure waste. Both are WebP; the thumb
// trades a little quality it will never show at that size for a much smaller payload.
export const COVER_MAX_DIMENSION = 1400;
export const COVER_WEBP_QUALITY = 78;
export const THUMB_MAX_DIMENSION = 500;
export const THUMB_WEBP_QUALITY = 70;

export interface CoverRenditions {
  cover: Buffer;
  thumb: Buffer;
}

function toBuffer(input: ArrayBuffer | Buffer): Buffer {
  return Buffer.isBuffer(input) ? input : Buffer.from(new Uint8Array(input));
}

/** Auto-orient from EXIF (then strip it), cap the longest edge, re-encode as WebP.
 *  Takes a sharp pipeline so callers can branch several outputs off one decoded input. */
function toWebp(pipeline: sharp.Sharp, maxDimension: number, quality: number): Promise<Buffer> {
  return pipeline
    .rotate()
    .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}

/**
 * Optimise a user-supplied image into both renditions before it ever reaches storage.
 * A 6 MB phone photo lands around 80–200 KB for the cover and ~15–25 KB for the thumb.
 * One decode, two outputs: `clone()` branches the pipeline off a single read of the source.
 */
export async function optimizeRenditions(input: ArrayBuffer | Buffer): Promise<CoverRenditions> {
  const source = sharp(toBuffer(input));
  const [cover, thumb] = await Promise.all([
    toWebp(source.clone(), COVER_MAX_DIMENSION, COVER_WEBP_QUALITY),
    toWebp(source.clone(), THUMB_MAX_DIMENSION, THUMB_WEBP_QUALITY),
  ]);
  return { cover, thumb };
}

/** Just the thumb rendition — for backfilling a recipe whose cover predates thumbnails,
 *  where only the smaller size is missing. */
export async function optimizeThumb(input: ArrayBuffer | Buffer): Promise<Buffer> {
  return toWebp(sharp(toBuffer(input)), THUMB_MAX_DIMENSION, THUMB_WEBP_QUALITY);
}

/** Fetch a remote image (e.g. an imported Reel thumbnail) and optimise it into both
 *  renditions. A browser-like user-agent is required — Instagram's CDN refuses bare
 *  fetches. Returns null on any fetch/decode failure. */
export async function optimizeRenditionsFromUrl(url: string): Promise<CoverRenditions | null> {
  const res = await safeFetch(url, { headers: { "user-agent": BROWSER_USER_AGENT } });
  if (!res || !res.ok) return null;
  const buf = await readCapped(res);
  if (!buf) return null;
  try {
    return await optimizeRenditions(buf);
  } catch {
    return null;
  }
}
