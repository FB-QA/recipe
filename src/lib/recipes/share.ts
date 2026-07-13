import { ingredientLine } from "./ingredient";

export type ShareableRecipe = {
  title: string;
  servings: string | null;
  prep_time: string | null;
  cook_time: string | null;
  ingredients: Array<{ display_text: string; quantity: string | null; unit: string | null; name: string | null }>;
  steps: Array<{ instruction: string }>;
  tips: Array<{ text: string }>;
  source_url: string | null;
};

/** Format a recipe as clean plain text for sharing / pasting into another app. */
export function recipeToText(r: ShareableRecipe): string {
  const lines: string[] = [r.title, ""];

  const meta = [
    r.servings && `Serves ${r.servings}`,
    r.prep_time && `Prep ${r.prep_time}`,
    r.cook_time && `Cook ${r.cook_time}`,
  ].filter(Boolean);
  if (meta.length) lines.push(meta.join(" · "), "");

  if (r.ingredients.length) {
    lines.push("Ingredients");
    for (const ing of r.ingredients) lines.push(`- ${ingredientLine(ing)}`);
    lines.push("");
  }

  if (r.steps.length) {
    lines.push("Method");
    r.steps.forEach((s, i) => lines.push(`${i + 1}. ${s.instruction}`));
    lines.push("");
  }

  if (r.tips.length) {
    lines.push("Tips");
    for (const t of r.tips) lines.push(`- ${t.text}`);
    lines.push("");
  }

  if (r.source_url) lines.push(`Source: ${r.source_url}`);

  return lines.join("\n").trim();
}
