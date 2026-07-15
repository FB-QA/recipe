import { describe, it, expect, vi } from "vitest";
import { swapCover } from "@/lib/recipes/cover";

describe("swapCover", () => {
  it("on success: deletes the old cover, keeps the new one", async () => {
    const removeFile = vi.fn(async () => {});
    const io = { repoint: vi.fn(async () => true), removeFile };

    const result = await swapCover(io, "new/path.webp", "old/path.webp");

    expect(result.ok).toBe(true);
    expect(removeFile).toHaveBeenCalledOnce();
    expect(removeFile).toHaveBeenCalledWith("old/path.webp");
    expect(removeFile).not.toHaveBeenCalledWith("new/path.webp");
  });

  it("when the re-point FAILS: never deletes the old cover, and bins the new upload", async () => {
    // This is the bug the reviewer caught: the DB write can fail after the new
    // image uploads, and the old file must survive so the recipe still resolves.
    const removeFile = vi.fn(async () => {});
    const io = { repoint: vi.fn(async () => false), removeFile };

    const result = await swapCover(io, "new/path.webp", "old/path.webp");

    expect(result.ok).toBe(false);
    expect(removeFile).toHaveBeenCalledOnce();
    expect(removeFile).toHaveBeenCalledWith("new/path.webp");
    expect(removeFile).not.toHaveBeenCalledWith("old/path.webp");
  });

  it("with no previous cover: repoints and deletes nothing", async () => {
    const removeFile = vi.fn(async () => {});
    const io = { repoint: vi.fn(async () => true), removeFile };

    const result = await swapCover(io, "new/path.webp", null);

    expect(result.ok).toBe(true);
    expect(removeFile).not.toHaveBeenCalled();
  });

  it("does not delete when the new path equals the old (defensive)", async () => {
    const removeFile = vi.fn(async () => {});
    const io = { repoint: vi.fn(async () => true), removeFile };

    await swapCover(io, "same/path.webp", "same/path.webp");

    expect(removeFile).not.toHaveBeenCalled();
  });
});
