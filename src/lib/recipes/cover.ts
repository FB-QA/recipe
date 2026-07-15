// The order-of-operations for swapping a recipe's cover, extracted so it can be
// tested without a database. The rule that matters: the old file is deleted ONLY
// after the recipe is confirmed to point at the new one. If the re-point fails,
// the new upload is removed (don't orphan it) and the old cover is left exactly
// where it is — the recipe must never be left pointing at a file we've deleted.

export type CoverSwapIO = {
  /** Point the recipe at `path`. Returns true on success, false on any DB error. */
  repoint: (path: string) => Promise<boolean>;
  /** Delete a stored file. */
  removeFile: (path: string) => Promise<void>;
};

export async function swapCover(
  io: CoverSwapIO,
  newPath: string,
  oldPath: string | null,
): Promise<{ ok: boolean }> {
  const repointed = await io.repoint(newPath);
  if (!repointed) {
    // The DB never moved to the new image — deleting the old one would strand the
    // recipe. Instead bin the new upload we just made, and leave the old intact.
    await io.removeFile(newPath);
    return { ok: false };
  }
  if (oldPath && oldPath !== newPath) {
    await io.removeFile(oldPath);
  }
  return { ok: true };
}
