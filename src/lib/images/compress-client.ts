import imageCompression from "browser-image-compression";
import { validateOriginalImage } from "./validate";

// The ONE place Cookdex knows which image-compression library it uses. Every
// upload path calls compressRecipeImage(); none of them import the library
// directly. Swapping browser-image-compression for something else (or a
// hand-rolled canvas encoder) means changing this file and nothing else.

export const COVER_MAX_DIMENSION = 1600; // longest edge, px — no upscaling
export const COVER_WEBP_QUALITY = 0.82; // inside the spec's 75–85% band

export class ImageCompressionError extends Error {}

/**
 * Shrink a user-selected photo IN THE BROWSER before it is uploaded: correct
 * orientation, cap the longest edge (never enlarge), strip metadata, re-encode
 * as WebP. A 6–15 MB phone photo comes back around 150–500 KB. Runs in a web
 * worker so a large decode doesn't freeze the UI on mobile.
 *
 * Throws ImageCompressionError with a user-facing message if the file is invalid
 * or the browser can't decode it (e.g. HEIC on a non-Safari browser).
 */
export async function compressRecipeImage(file: File): Promise<File> {
  const check = validateOriginalImage(file);
  if (!check.ok) throw new ImageCompressionError(check.error);

  let out: File | Blob;
  try {
    out = await imageCompression(file, {
      maxWidthOrHeight: COVER_MAX_DIMENSION,
      useWebWorker: true,
      fileType: "image/webp",
      initialQuality: COVER_WEBP_QUALITY,
      // browser-image-compression reads EXIF orientation and bakes it into the
      // pixels, then drops the metadata — portrait photos stay upright.
    });
  } catch {
    throw new ImageCompressionError(
      "Couldn't process that photo. Try a JPEG or PNG, or a different image.",
    );
  }

  // Normalise back to a File with a stable name/type for the upload layer.
  return new File([out], "cover.webp", { type: "image/webp" });
}
