import type { AiExtractedRecipe, ExtractedIngredient, ExtractedIngredientGroup } from "./schema";

/**
 * §19 — validation & quality scoring. Runs after every extraction:
 * empty strings to null, drop empty groups/ingredients/steps, validate
 * positions, drop exact duplicates, repair ranges/times/alternative groups —
 * always by REMOVING bad data, never by inventing replacements.
 * No model-generated confidence score anywhere.
 */

const MEANINGLESS_STEP_TITLE = /^\s*step\s*\d+\s*[.:]?\s*$/i;

function blankToNull(v: string | null): string | null {
  const t = v?.trim() ?? "";
  return t.length > 0 ? t : null;
}

function positiveOrNull(v: number | null): number | null {
  return v !== null && Number.isFinite(v) && v > 0 ? v : null;
}

function normaliseIngredient(ing: ExtractedIngredient, position: number): ExtractedIngredient {
  let { quantityMin, quantityMax } = ing;
  // Half-ranges carry no honest range information — drop rather than guess.
  if ((quantityMin === null) !== (quantityMax === null)) {
    quantityMin = null;
    quantityMax = null;
  }
  // An inverted range is a transcription slip; reorder, never collapse.
  if (quantityMin !== null && quantityMax !== null && quantityMin > quantityMax) {
    [quantityMin, quantityMax] = [quantityMax, quantityMin];
  }
  return {
    ...ing,
    position,
    originalText: ing.originalText.trim(),
    quantityText: blankToNull(ing.quantityText),
    quantityValue: positiveOrNull(ing.quantityValue),
    quantityMin,
    quantityMax,
    unit: blankToNull(ing.unit),
    name: ing.name.trim(),
    preparation: blankToNull(ing.preparation),
    alternativeGroupId: blankToNull(ing.alternativeGroupId),
  };
}

export function normaliseRecipe(recipe: AiExtractedRecipe): AiExtractedRecipe {
  // Groups: normalise ingredients, drop empties, drop exact duplicates.
  const seen = new Set<string>();
  const groups: ExtractedIngredientGroup[] = [];
  for (const group of recipe.ingredientGroups) {
    const ingredients: ExtractedIngredient[] = [];
    for (const raw of group.ingredients) {
      if (!raw.originalText.trim()) continue;
      const key = raw.originalText.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      ingredients.push(normaliseIngredient(raw, ingredients.length));
    }
    if (ingredients.length === 0) continue;
    groups.push({
      ...group,
      name: blankToNull(group.name),
      position: groups.length,
      ingredients,
    });
  }

  // Alternative groups with fewer than two members are not alternatives.
  const altCounts = new Map<string, number>();
  for (const g of groups)
    for (const i of g.ingredients)
      if (i.alternativeGroupId) altCounts.set(i.alternativeGroupId, (altCounts.get(i.alternativeGroupId) ?? 0) + 1);
  for (const g of groups)
    for (const i of g.ingredients)
      if (i.alternativeGroupId && (altCounts.get(i.alternativeGroupId) ?? 0) < 2) i.alternativeGroupId = null;

  // Steps: drop empties, re-sequence, strip meaningless titles (§18: never "Step 1").
  const steps = recipe.steps
    .filter((s) => s.instruction.trim().length > 0)
    .map((s, position) => ({
      ...s,
      position,
      instruction: s.instruction.trim(),
      title: MEANINGLESS_STEP_TITLE.test(s.title ?? "") ? null : blankToNull(s.title),
    }));

  return {
    ...recipe,
    title: blankToNull(recipe.title),
    description: blankToNull(recipe.description),
    servings: {
      value: positiveOrNull(recipe.servings.value),
      originalText: blankToNull(recipe.servings.originalText),
    },
    prepTimeMinutes: positiveOrNull(recipe.prepTimeMinutes),
    cookTimeMinutes: positiveOrNull(recipe.cookTimeMinutes),
    totalTimeMinutes: positiveOrNull(recipe.totalTimeMinutes),
    ingredientGroups: groups,
    steps,
    tips: recipe.tips.map((t) => t.trim()).filter(Boolean),
    servingSuggestions: recipe.servingSuggestions.map((t) => t.trim()).filter(Boolean),
  };
}

/**
 * §19 minimum usable recipe: extractionStatus 'recipe', a title, ≥1 ingredient
 * with non-empty original text, ≥1 step with a non-empty instruction.
 * Missing servings/times/quantities/description/tips are accept-with-warnings.
 */
export function minimumUsable(recipe: AiExtractedRecipe): boolean {
  if (recipe.extractionStatus !== "recipe") return false;
  if (!recipe.title) return false;
  const ingredientCount = recipe.ingredientGroups.reduce((n, g) => n + g.ingredients.length, 0);
  return ingredientCount >= 1 && recipe.steps.length >= 1;
}

/**
 * The Cookdex quality score (§19): a transparent additive completeness rubric,
 * 0–100. Deliberately deterministic — no model in the loop.
 */
export function qualityScore(recipe: AiExtractedRecipe): number {
  if (!minimumUsable(recipe)) return 0;
  let score = 40; // usable floor: title + ingredients + steps present

  const ingredients = recipe.ingredientGroups.flatMap((g) => g.ingredients);
  const quantified = ingredients.filter(
    (i) => i.quantityText !== null || i.quantityValue !== null || i.quantityMin !== null,
  ).length;
  score += Math.round(20 * (quantified / ingredients.length)); // parsed quantities
  if (recipe.steps.length >= 2) score += 10;
  if (recipe.servings.value !== null || recipe.servings.originalText !== null) score += 8;
  if (recipe.prepTimeMinutes !== null || recipe.cookTimeMinutes !== null || recipe.totalTimeMinutes !== null)
    score += 8;
  if (recipe.description !== null) score += 6;
  if (recipe.tips.length > 0 || recipe.servingSuggestions.length > 0) score += 4;
  if (recipe.ingredientGroups.some((g) => g.name !== null)) score += 4;
  score -= Math.min(10, recipe.warnings.length * 2); // honest warnings cost a little

  return Math.max(0, Math.min(100, score));
}
