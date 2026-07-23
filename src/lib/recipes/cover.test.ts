// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// storeCoverFromUrl fetches + optimises a remote image; stub that boundary so the
// test is about the upload orchestration (both renditions, graceful thumb failure),
// not about sharp or the network.
vi.mock("@/lib/images/optimize", () => ({
  optimizeRenditionsFromUrl: vi.fn(),
  optimizeThumb: vi.fn(async () => Buffer.from("THUMB")),
}));

import { optimizeRenditionsFromUrl } from "@/lib/images/optimize";
import { backfillThumb, recipeCoverPath, recipeThumbPath, storeCoverFromUrl } from "./cover";

const mockOptimize = vi.mocked(optimizeRenditionsFromUrl);

/** A storage double that records every upload and can be told which paths error. */
function fakeStorage(errorOn: Record<string, boolean> = {}) {
  const uploads: Array<{ path: string; contentType: string; upsert: boolean }> = [];
  return {
    uploads,
    from: () => ({
      upload: async (path: string, _body: Buffer, opts: { contentType: string; upsert: boolean }) => {
        uploads.push({ path, contentType: opts.contentType, upsert: opts.upsert });
        return { error: errorOn[path] ? new Error("boom") : null };
      },
    }),
  };
}

const USER = "user-1";
const RECIPE = "recipe-9";

beforeEach(() => {
  mockOptimize.mockReset();
  mockOptimize.mockResolvedValue({ cover: Buffer.from("COVER"), thumb: Buffer.from("THUMB") });
});

describe("path helpers", () => {
  it("place the cover and thumb side by side in the recipe's folder", () => {
    expect(recipeCoverPath(USER, RECIPE)).toBe("user-1/recipe-9/cover.webp");
    expect(recipeThumbPath(USER, RECIPE)).toBe("user-1/recipe-9/thumb.webp");
  });
});

describe("storeCoverFromUrl", () => {
  it("uploads both renditions as webp and returns both paths", async () => {
    const storage = fakeStorage();
    const result = await storeCoverFromUrl(storage, USER, RECIPE, "https://x/y.jpg");
    expect(result).toEqual({ cover: "user-1/recipe-9/cover.webp", thumb: "user-1/recipe-9/thumb.webp" });
    expect(storage.uploads.map((u) => u.path)).toEqual([
      "user-1/recipe-9/cover.webp",
      "user-1/recipe-9/thumb.webp",
    ]);
    expect(storage.uploads.every((u) => u.contentType === "image/webp" && u.upsert)).toBe(true);
  });

  it("keeps the cover when only the thumb upload fails — thumb is best-effort", async () => {
    const storage = fakeStorage({ "user-1/recipe-9/thumb.webp": true });
    const result = await storeCoverFromUrl(storage, USER, RECIPE, "https://x/y.jpg");
    expect(result).toEqual({ cover: "user-1/recipe-9/cover.webp", thumb: null });
  });

  it("fails when the cover upload fails", async () => {
    const storage = fakeStorage({ "user-1/recipe-9/cover.webp": true });
    const result = await storeCoverFromUrl(storage, USER, RECIPE, "https://x/y.jpg");
    expect(result).toBeNull();
  });

  it("returns null (no uploads) when the image can't be fetched/optimised", async () => {
    mockOptimize.mockResolvedValue(null);
    const storage = fakeStorage();
    const result = await storeCoverFromUrl(storage, USER, RECIPE, "https://x/y.jpg");
    expect(result).toBeNull();
    expect(storage.uploads).toHaveLength(0);
  });
});

describe("backfillThumb", () => {
  it("uploads a thumb generated from the cover bytes and returns its path", async () => {
    const storage = fakeStorage();
    const path = await backfillThumb(storage, USER, RECIPE, Buffer.from("COVER-BYTES"));
    expect(path).toBe("user-1/recipe-9/thumb.webp");
    expect(storage.uploads.map((u) => u.path)).toEqual(["user-1/recipe-9/thumb.webp"]);
    expect(storage.uploads[0].contentType).toBe("image/webp");
  });

  it("returns null when the thumb upload fails", async () => {
    const storage = fakeStorage({ "user-1/recipe-9/thumb.webp": true });
    expect(await backfillThumb(storage, USER, RECIPE, Buffer.from("X"))).toBeNull();
  });
});
