import type { RecipeFormInitial } from "@/components/recipes/recipe-form";
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

/** One editable line per ingredient, verbatim wording preserved. */
function ingredientLines(recipe: ExtractedRecipe): string[] {
  const lines: string[] = [];
  for (const group of recipe.ingredientGroups) {
    for (const ing of group.ingredients) {
      lines.push(ing.originalText);
    }
  }
  return lines.length > 0 ? lines : [""];
}

function stepLines(recipe: ExtractedRecipe): string[] {
  const lines = recipe.steps.map((s) => (s.title ? `${s.title}: ${s.instruction}` : s.instruction));
  return lines.length > 0 ? lines : [""];
}

export function extractedToFormInitial(recipe: ExtractedRecipe, sourceUrl = ""): RecipeFormInitial {
  return {
    title: recipe.title ?? "Untitled recipe",
    description: recipe.description ?? "",
    servings: recipe.servings.originalText ?? (recipe.servings.value !== null ? String(recipe.servings.value) : ""),
    prep_time: minutesToLabel(recipe.prepTimeMinutes),
    cook_time: minutesToLabel(recipe.cookTimeMinutes),
    source_url: recipe.source.sourceUrl ?? sourceUrl,
    ingredients: ingredientLines(recipe),
    steps: stepLines(recipe),
    tips: recipe.tips,
    coverUrl: null,
  };
}
