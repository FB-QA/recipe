import sharp from "sharp";

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

const FETCH_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15";

/** Fetch a remote image (e.g. an imported Reel thumbnail) and optimise it.
 *  A browser-like user-agent is required — Instagram's CDN refuses bare fetches. */
export async function optimizeFromUrl(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": FETCH_UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return await optimizeCover(buf);
  } catch {
    return null;
  }
}
