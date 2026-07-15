import { describe, it, expect } from "vitest";
import {
  validateOriginalImage,
  validateStoredImage,
  MAX_ORIGINAL_BYTES,
  MAX_STORED_BYTES,
} from "@/lib/images/validate";

describe("validateOriginalImage (client, pre-compression)", () => {
  it("accepts any image type within the size cap", () => {
    expect(validateOriginalImage({ type: "image/jpeg", size: 8_000_000 })).toEqual({ ok: true });
    expect(validateOriginalImage({ type: "image/heic", size: 12_000_000 })).toEqual({ ok: true });
  });

  it("rejects a non-image file with a clear message", () => {
    const r = validateOriginalImage({ type: "application/pdf", size: 1000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/image/i);
  });

  it("rejects a file over the original size cap", () => {
    const r = validateOriginalImage({ type: "image/jpeg", size: MAX_ORIGINAL_BYTES + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too (big|large)|15\s?MB/i);
  });

  it("rejects an empty file", () => {
    expect(validateOriginalImage({ type: "image/png", size: 0 }).ok).toBe(false);
  });
});

describe("validateStoredImage (server, post-compression — do not trust the client)", () => {
  it("accepts the webp both pipelines produce", () => {
    expect(validateStoredImage({ type: "image/webp", size: 200_000 })).toEqual({ ok: true });
  });

  it("rejects any type the compressor and optimiser never emit (webp-only)", () => {
    expect(validateStoredImage({ type: "image/jpeg", size: 300_000 }).ok).toBe(false);
    expect(validateStoredImage({ type: "image/png", size: 100 }).ok).toBe(false);
    expect(validateStoredImage({ type: "application/pdf", size: 100 }).ok).toBe(false);
  });

  it("rejects an oversized upload — a compressed cover is never this big", () => {
    expect(validateStoredImage({ type: "image/webp", size: MAX_STORED_BYTES + 1 }).ok).toBe(false);
  });
});
