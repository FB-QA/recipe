import type { RecipeFormInitial } from "@/components/recipes/recipe-form";
import type { EditGroup } from "@/components/recipes/grouped-ingredients";
import type { ExtractedRecipe } from "./schema";

/**
 * Adapt a v2 structured `ExtractedRecipe` to the existing flat recipe form for
 * review. Faithful rendering of ingredient groups, ranges and alternatives is
 * the `import-capture-review-v2` story; here the review shows the same content
 * the source gave, flattened, so nothing is lost before it can be edited. The
 * structured detail is preserved on the import row for that next story to
 * persist — this adapter is display-only.
 */

/** 90 → "1 hr 30 min"; 20 → "20 min"; null → "". */
export function minutesToLabel(mins: number | null): string {
  if (mins === null || mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

/** Flat fallback lines (non-grouped consumers). */
function ingredientLines(recipe: ExtractedRecipe): string[] {
  const lines = recipe.ingredientGroups.flatMap((g) => g.ingredients.map((i) => i.originalText));
  return lines.length > 0 ? lines : [""];
}

/** The structured, editable sections — verbatim wording, ranges/optionals/alternatives preserved. */
function editGroups(recipe: ExtractedRecipe): EditGroup[] {
  return recipe.ingredientGroups.map((g) => ({
    name: g.name ?? "",
    ingredients: g.ingredients.map((i) => ({
      display_text: i.originalText,
      optional: i.optional,
      quantity_min: i.quantityMin,
      quantity_max: i.quantityMax,
      alternative_group: i.alternativeGroupId,
      preparation: i.preparation,
    })),
  }));
}

export function extractedToFormInitial(recipe: ExtractedRecipe, sourceUrl = ""): RecipeFormInitial {
  const hasGroups = recipe.ingredientGroups.some((g) => g.ingredients.length > 0);
  return {
    title: recipe.title ?? "Untitled recipe",
    description: recipe.description ?? "",
    servings: recipe.servings.originalText ?? (recipe.servings.value !== null ? String(recipe.servings.value) : ""),
    prep_time: minutesToLabel(recipe.prepTimeMinutes),
    cook_time: minutesToLabel(recipe.cookTimeMinutes),
    calories: recipe.nutrition?.calories ?? "",
    protein: recipe.nutrition?.protein ?? "",
    carbs: recipe.nutrition?.carbs ?? "",
    fat: recipe.nutrition?.fat ?? "",
    source_url: recipe.source.sourceUrl ?? sourceUrl,
    ingredients: ingredientLines(recipe),
    groups: hasGroups ? editGroups(recipe) : undefined,
    steps: recipe.steps.length > 0 ? recipe.steps.map((s) => s.instruction) : [""],
    stepTitles: recipe.steps.map((s) => s.title),
    tips: recipe.tips,
    coverUrl: null,
  };
}
