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

    // Keep an alpha-capable format for sources that can carry transparency
    // (PNG/WebP) — re-encoding those to JPEG would composite transparent regions
    // onto black. JPEG stays the target for opaque photos (smaller for the same
    // quality). If the browser can't encode WebP, toBlob returns null and we fall
    // back to the original file below.
    const alphaCapable = /png|webp/i.test(file.type);
    const outType = alphaCapable ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outType, quality),
    );
    if (!blob || blob.size >= file.size) return file; // no win → keep the original

    const base = file.name.replace(/\.[^.]+$/, "") || "cover";
    const ext = outType === "image/webp" ? "webp" : "jpg";
    return new File([blob], `${base}.${ext}`, { type: outType });
  } finally {
    bitmap.close?.();
  }
}
