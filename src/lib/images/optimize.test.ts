// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  COVER_MAX_DIMENSION,
  optimizeRenditions,
  THUMB_MAX_DIMENSION,
} from "./optimize";

/** A synthetic source image, larger than both caps, with enough detail that the
 *  encoder produces meaningfully different sizes at the two resolutions. */
async function sourceImage(width = 2400, height = 1600): Promise<Buffer> {
  // A noisy gradient — flat colour compresses to almost nothing and wouldn't
  // exercise the size difference we assert on.
  const channels = 3;
  const data = Buffer.alloc(width * height * channels);
  for (let i = 0; i < data.length; i++) data[i] = (i * 37) % 256;
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

const longestEdge = async (buf: Buffer) => {
  const { width = 0, height = 0 } = await sharp(buf).metadata();
  return Math.max(width, height);
};

describe("optimizeRenditions", () => {
  it("produces a webp cover and a webp thumb", async () => {
    const { cover, thumb } = await optimizeRenditions(await sourceImage());
    expect((await sharp(cover).metadata()).format).toBe("webp");
    expect((await sharp(thumb).metadata()).format).toBe("webp");
  });

  it("caps each rendition at its own longest edge", async () => {
    const { cover, thumb } = await optimizeRenditions(await sourceImage());
    expect(await longestEdge(cover)).toBeLessThanOrEqual(COVER_MAX_DIMENSION);
    expect(await longestEdge(thumb)).toBeLessThanOrEqual(THUMB_MAX_DIMENSION);
  });

  it("makes the thumb materially smaller than the cover", async () => {
    const { cover, thumb } = await optimizeRenditions(await sourceImage());
    expect(thumb.length).toBeLessThan(cover.length);
  });

  it("never enlarges a source already smaller than both caps", async () => {
    const small = await sharp({
      create: { width: 200, height: 150, channels: 3, background: { r: 90, g: 120, b: 90 } },
    })
      .png()
      .toBuffer();
    const { cover, thumb } = await optimizeRenditions(small);
    expect(await longestEdge(cover)).toBe(200);
    expect(await longestEdge(thumb)).toBe(200);
  });

  it("rejects on a non-image buffer, so callers can treat it as a failed cover", async () => {
    // The save path wraps this in try/catch (recipe still saves, cover just doesn't
    // stick) and optimizeRenditionsFromUrl swallows it to null — both rely on it throwing
    // rather than producing a bogus upload.
    await expect(optimizeRenditions(Buffer.from("this is not an image"))).rejects.toThrow();
  });

  it("accepts an ArrayBuffer as well as a Buffer", async () => {
    const buf = await sourceImage();
    const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(buf);
    const { cover, thumb } = await optimizeRenditions(ab);
    expect(cover.length).toBeGreaterThan(0);
    expect(thumb.length).toBeGreaterThan(0);
  });
});
