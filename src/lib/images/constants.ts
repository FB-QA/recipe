// Single source of truth for cover-image processing, shared by BOTH pipelines:
// the client compressor (user uploads, browser-image-compression) and the server
// optimiser (import-from-URL covers, sharp). A cover looks the same regardless of
// where it came from, so the tuning lives in exactly one place.

/** Longest edge in px. Images are never enlarged past their original size. */
export const COVER_MAX_DIMENSION = 1600;

/** WebP quality as a 0–1 fraction (spec band 0.75–0.85). sharp takes 0–100, so
 *  the server path scales this up — it does not carry its own copy. */
export const COVER_WEBP_QUALITY = 0.82;

/** The one format Cookdex stores covers in. Client output, server output, and the
 *  server-side upload validator all reference this — never the bare string. */
export const WEBP_MIME = "image/webp";
