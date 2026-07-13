import sharp from "sharp";
import { BROWSER_USER_AGENT } from "@/lib/http";
import { safeFetch, readCapped } from "@/lib/safe-fetch";

export const COVER_MAX_DIMENSION = 1400;
export const COVER_WEBP_QUALITY = 78;

/**
 * Optimise a user-supplied image before it ever reaches storage:
 * auto-orient from EXIF, cap the longest edge, and re-encode as WebP.
 * A 6 MB phone photo lands around 80–200 KB.
 */
export async function optimizeCover(input: ArrayBuffer | Buffer): Promise<Buffer> {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(new Uint8Array(input));
  return sharp(buffer)
    .rotate() // honour EXIF orientation, then strip it
    .resize({
      width: COVER_MAX_DIMENSION,
      height: COVER_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: COVER_WEBP_QUALITY })
    .toBuffer();
}

/** Fetch a remote image (e.g. an imported Reel thumbnail) and optimise it.
 *  A browser-like user-agent is required — Instagram's CDN refuses bare fetches. */
export async function optimizeFromUrl(url: string): Promise<Buffer | null> {
  const res = await safeFetch(url, { headers: { "user-agent": BROWSER_USER_AGENT } });
  if (!res || !res.ok) return null;
  const buf = await readCapped(res);
  if (!buf) return null;
  try {
    return await optimizeCover(buf);
  } catch {
    return null;
  }
}
