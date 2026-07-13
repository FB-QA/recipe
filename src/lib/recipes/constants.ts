/** Query flag that makes the recipe detail page fire its one-off "Saved" toast. */
export const CREATED_PARAM = "created";

/** Detail-page href for a just-created recipe (triggers the "Saved" toast). */
export const createdRecipeHref = (id: string) => `/recipes/${id}?${CREATED_PARAM}=1`;
