/**
 * Downscale + re-encode an image in the browser BEFORE it is uploaded. A raw
 * phone screenshot (PNG, several MB) otherwise exceeds the serverless request-body
 * limit and the cover upload fails outright — the reason "PNGs" specifically broke
 * while smaller camera JPEGs squeaked through. We shrink to a sane max edge and
 * re-encode as JPEG, so the payload is small and format-agnostic; the server still
 * optimises to WebP afterwards. Falls back to the original file if anything about
 * the decode/encode fails — never worse than before.
 */
export async function downscaleImage(file: File, maxDim = 1600, quality = 0.85): Promise<File> {
  if (typeof document === "undefined" || !file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    // Already small in both dimensions and bytes — leave it untouched.
    if (scale === 1 && file.size <= 2_500_000) return file;

    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file; // no win → keep the original

    const base = file.name.replace(/\.[^.]+$/, "") || "cover";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close?.();
  }
}
