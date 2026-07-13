import { z } from "zod";

export type ExtractedIngredient = {
  display_text: string;
  quantity?: string | null;
  unit?: string | null;
  name?: string | null;
};

export type ExtractedRecipe = {
  title: string;
  description: string | null;
  servings: string | null;
  prep_time: string | null;
  cook_time: string | null;
  ingredients: ExtractedIngredient[];
  steps: string[];
  tips: string[];
  imageUrl: string | null;
  sourceHandle: string | null;
};

export type SourceType = "instagram" | "website";

/** The shape the AI is forced to return — nullable so a sparse source yields
 *  nulls/[] instead of invented data. */
export const aiRecipeSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
  prep_time: z.string().nullable(),
  cook_time: z.string().nullable(),
  servings: z.string().nullable(),
  tips: z.array(z.string()),
});
export type AiRecipe = z.infer<typeof aiRecipeSchema>;

export type ImportOutcome =
  | {
      status: "success";
      sourceType: SourceType;
      method: "jsonld" | "ai_text" | "apify+ai" | "cache";
      costCents: number;
      recipe: ExtractedRecipe;
      mediaUrl?: string | null;
    }
  | {
      status: "no_recipe";
      sourceType: SourceType;
      method: string;
      costCents: number;
      mediaUrl: string | null;
      message: string;
    }
  | { status: "failed"; costCents: number; error: string };

/** A recipe is only "real" if we have something to cook from. */
export function hasCookableContent(r: ExtractedRecipe): boolean {
  return r.ingredients.length > 0 && r.steps.length > 0;
}
