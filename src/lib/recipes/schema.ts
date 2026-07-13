import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : (v ?? null)));

export const ingredientSchema = z.object({
  display_text: z.string().trim().min(1, "Ingredient can't be empty.").max(300),
  quantity: optionalText(60),
  unit: optionalText(60),
  name: optionalText(200),
});

export const recipeInputSchema = z.object({
  title: z.string().trim().min(1, "Give the recipe a title.").max(200),
  description: optionalText(4000),
  // Free text from imports can be verbose ("plus 1 hr or overnight soaking").
  servings: optionalText(200),
  prep_time: optionalText(200),
  cook_time: optionalText(200),
  source_url: z
    .string()
    .trim()
    .max(2000)
    .url("That doesn't look like a valid link.")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  source_type: z.enum(["manual", "instagram", "website"]).default("manual"),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  ingredients: z.array(ingredientSchema).max(200).default([]),
  steps: z.array(z.object({ instruction: z.string().trim().min(1).max(4000) })).max(100).default([]),
  tips: z.array(z.string().trim().min(1).max(2000)).max(50).default([]),
});

export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type IngredientInput = z.infer<typeof ingredientSchema>;

/** Parse the JSON payload a recipe form submits. Returns typed data or issues. */
export function parseRecipePayload(raw: unknown) {
  return recipeInputSchema.safeParse(raw);
}
