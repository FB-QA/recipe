/**
 * Story-2 verification: grouped save round-trips through the real DB.
 * Inserts a recipe with two named sections (ranges, optional, step title),
 * then reads it back through the same grouping the detail page uses.
 *
 *   npx tsx --tsconfig tsconfig.json --env-file=.env --env-file=.env.local scripts/verify-groups-e2e.mts
 */
import { createServiceClient } from "@/lib/supabase/server";
import { resolveGroups, flattenIngredients } from "@/lib/recipes/groups";
import type { RecipeInput } from "@/lib/recipes/schema";

const USER = "5a7e123a-9d3d-4ee8-9aa2-3c55bc3cc56a"; // freddi@cookdex.test
const line = (s: string) => console.log(s);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createServiceClient() as any;

const input = {
  ingredients: [],
  ingredientGroups: [
    { name: "For the gnocchi ragu", optional: false, ingredients: [
      { display_text: "1–2 tbsp olive oil", quantity: null, unit: null, name: null, quantity_value: null, quantity_min: 1, quantity_max: 2, preparation: null, optional: false, alternative_group: null },
      { display_text: "500g gnocchi", quantity: null, unit: null, name: null, quantity_value: 500, quantity_min: null, quantity_max: null, preparation: null, optional: false, alternative_group: null },
    ] },
    { name: "For the béchamel", optional: false, ingredients: [
      { display_text: "50g butter (optional)", quantity: null, unit: null, name: null, quantity_value: 50, quantity_min: null, quantity_max: null, preparation: null, optional: true, alternative_group: null },
    ] },
  ],
  steps: [{ instruction: "Brown the mince.", title: "Make the ragu" }],
  tips: [],
} as unknown as RecipeInput;

async function main() {
  // Insert the recipe.
  const { data: recipe, error } = await db.from("recipes")
    .insert({ user_id: USER, title: "Story-2 verify — Gnocchi Lasagne", source_type: "instagram" })
    .select("id").single();
  if (error) return line("✗ recipe insert: " + error.message);
  const recipeId = recipe.id as string;

  // Mimic replaceChildren: groups → ids → ingredients(group_id) → steps(title).
  const groups = resolveGroups(input);
  const { data: gRows } = await db.from("recipe_ingredient_groups")
    .insert(groups.map((g, i) => ({ recipe_id: recipeId, name: g.name, optional: g.optional, position: i })))
    .select("id");
  const groupIds = (gRows ?? []).map((g: { id: string }) => g.id);
  const rows = flattenIngredients(groups).map((r) => ({
    recipe_id: recipeId, group_id: groupIds[r.groupIndex], display_text: r.display_text,
    quantity_min: r.quantity_min, quantity_max: r.quantity_max, optional: r.optional,
    alternative_group: r.alternative_group, sort_order: r.sort_order,
  }));
  await db.from("recipe_ingredients").insert(rows);
  await db.from("recipe_steps").insert(input.steps.map((s, i) => ({ recipe_id: recipeId, instruction: s.instruction, title: s.title, sort_order: i })));

  // Read back the way getRecipe does.
  const { data } = await db.from("recipes").select(
    `id, recipe_ingredient_groups (id, name, position, optional),
     recipe_ingredients (id, display_text, sort_order, group_id, optional, quantity_min, quantity_max),
     recipe_steps (id, instruction, title, sort_order)`,
  ).eq("id", recipeId).single();

  const ings = [...data.recipe_ingredients].sort((a, b) => a.sort_order - b.sort_order);
  const sections = [...data.recipe_ingredient_groups].sort((a, b) => a.position - b.position)
    .map((g) => ({ name: g.name, ingredients: ings.filter((i) => i.group_id === g.id) }));

  line("\n=== read back ===");
  for (const s of sections) {
    line(`  § ${s.name}`);
    for (const i of s.ingredients) {
      const range = i.quantity_min !== null ? ` [range ${i.quantity_min}–${i.quantity_max}]` : "";
      line(`     - ${i.display_text}${i.optional ? " (optional)" : ""}${range}`);
    }
  }
  const step = data.recipe_steps[0];
  line(`  step title: "${step.title}" · instruction: "${step.instruction}"`);

  const ok = sections.length === 2 && sections[0].name === "For the gnocchi ragu"
    && sections[0].ingredients[0].quantity_min === 1 && sections[1].ingredients[0].optional === true
    && step.title === "Make the ragu";
  line(`\n${ok ? "✓ PASS" : "✗ FAIL"} — sections, ranges, optional flag and step title all round-tripped`);

  // Clean up.
  await db.from("recipes").delete().eq("id", recipeId);
  line("(cleaned up test recipe)");
}

await main();
