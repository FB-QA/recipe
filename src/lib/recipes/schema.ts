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
  // v2 structured fields (import-capture-review-v2). All optional so the manual
  // flat form still validates unchanged.
  quantity_value: z.number().nullable().optional(),
  quantity_min: z.number().nullable().optional(),
  quantity_max: z.number().nullable().optional(),
  preparation: optionalText(300),
  optional: z.boolean().optional().default(false),
  alternative_group: z.string().trim().max(64).nullable().optional(),
});

/** A named (or unnamed) ingredient section — the faithful group structure. */
export const ingredientGroupSchema = z.object({
  name: optionalText(200),
  optional: z.boolean().optional().default(false),
  ingredients: z.array(ingredientSchema).max(200),
});

export const recipeInputSchema = z.object({
  title: z.string().trim().min(1, "Give the recipe a title.").max(200),
  description: optionalText(4000),
  // Free text from imports can be verbose ("plus 1 hr or overnight soaking").
  servings: optionalText(200),
  prep_time: optionalText(200),
  cook_time: optionalText(200),
  // Nutrition, verbatim from the source (e.g. "480 kcal", "45g").
  calories: optionalText(60),
  protein: optionalText(60),
  carbs: optionalText(60),
  fat: optionalText(60),
  fibre: optionalText(60),
  sugar: optionalText(60),
  nutrition_per_serving: z.boolean().nullable().optional(),
  source_url: z
    .string()
    .trim()
    .max(2000)
    .url("That doesn't look like a valid link.")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  source_type: z.enum(["manual", "instagram", "website"]).default("manual"),
  source_handle: optionalText(100),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  ingredients: z.array(ingredientSchema).max(200).default([]),
  // Optional structured sections. When present the save path persists them
  // faithfully (groups + ranges + optionals + alternatives); when absent the
  // flat `ingredients` list is treated as one unnamed group.
  ingredientGroups: z.array(ingredientGroupSchema).max(30).optional(),
  steps: z
    .array(z.object({ instruction: z.string().trim().min(1).max(4000), title: optionalText(200) }))
    .max(100)
    .default([]),
  tips: z.array(z.string().trim().min(1).max(2000)).max(50).default([]),
});

export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type IngredientInput = z.infer<typeof ingredientSchema>;
export type IngredientGroupInput = z.infer<typeof ingredientGroupSchema>;

/** Parse the JSON payload a recipe form submits. Returns typed data or issues. */
export function parseRecipePayload(raw: unknown) {
  return recipeInputSchema.safeParse(raw);
}
