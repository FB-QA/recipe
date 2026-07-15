// Storage layout for recipe media (bucket: recipe-images).
//
//   {user_id}/recipes/{recipe_id}/cover/{image_uuid}.webp
//
// The user id is deliberately the FIRST segment: the bucket's RLS policy keys on
// (storage.foldername(name))[1] = auth.uid(), so every path must start with the
// owner's id. A fresh uuid per image (rather than a fixed "cover.webp") means a
// replaced cover gets a new URL — the old signed URL can never serve a stale
// image after a swap. The whole {user_id}/recipes/{recipe_id} subtree is removed
// on recipe delete, leaving room for future recipe media without a new layout.

/** Path for one cover image. `imageId` should be a fresh uuid per upload. */
export function coverImagePath(userId: string, recipeId: string, imageId: string): string {
  return `${recipeMediaFolder(userId, recipeId)}/cover/${imageId}.webp`;
}

/** The whole per-recipe media subtree — cleared when the recipe is deleted. */
export function recipeMediaFolder(userId: string, recipeId: string): string {
  return `${userId}/recipes/${recipeId}`;
}

/** The folder Supabase `list()` enumerates to find a recipe's cover file(s). */
export function coverFolder(userId: string, recipeId: string): string {
  return `${recipeMediaFolder(userId, recipeId)}/cover`;
}
