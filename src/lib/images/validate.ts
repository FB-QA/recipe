// Two validation points, deliberately asymmetric.
//
//   validateOriginalImage — client-side, BEFORE compression. Permissive on type
//     (a phone hands us HEIC/HEIF as readily as JPEG) but caps the original size
//     so we fail a 40 MB burst-shot fast, with a clear message, before wasting a
//     decode on it.
//   validateStoredImage — server-side, AFTER compression, on the bytes actually
//     landing in storage. Strict: it must be the WebP our own compressor and
//     optimiser produce, and small. "Do not trust the client" — a hand-crafted
//     multipart POST could put anything in the `cover` field.

import { WEBP_MIME } from "./constants";

export const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024; // 15 MB — a generous phone photo
export const MAX_STORED_BYTES = 3 * 1024 * 1024; // a compressed cover is ~150–500 KB; 3 MB is slack

// WebP only: the client compressor and the server optimiser both emit WebP and
// nothing else, so the validator accepts exactly what those two produce.
const STORED_TYPES = new Set([WEBP_MIME]);

export type ImageCheck = { ok: true } | { ok: false; error: string };

export function validateOriginalImage(file: { type: string; size: number }): ImageCheck {
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "That's not an image. Choose a JPEG, PNG, or HEIC photo." };
  }
  if (file.size === 0) {
    return { ok: false, error: "That image looks empty. Try a different photo." };
  }
  if (file.size > MAX_ORIGINAL_BYTES) {
    return { ok: false, error: "That photo is too big (over 15 MB). Try a smaller one." };
  }
  return { ok: true };
}

export function validateStoredImage(file: { type: string; size: number }): ImageCheck {
  if (!STORED_TYPES.has(file.type)) {
    return { ok: false, error: "Unsupported image format." };
  }
  if (file.size === 0 || file.size > MAX_STORED_BYTES) {
    return { ok: false, error: "That image couldn't be processed. Try another." };
  }
  return { ok: true };
}
