import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { CloseIcon } from "@/components/icons";
import { RecipeForm, type RecipeFormInitial } from "@/components/recipes/recipe-form";
import { getRecipe } from "@/lib/recipes/queries";
import { updateRecipe } from "@/lib/recipes/actions";
import { ingredientLine } from "@/lib/recipes/ingredient";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();

  // A recipe with real sections OR any structured ingredient metadata edits in
  // grouped mode; only a genuinely plain recipe (unnamed single group, plain
  // display-text lines) stays on the simple list. Opening a structured recipe
  // flat would drop its optionals/ranges/preparations/alternatives on the next
  // save, even if the user only touched the title.
  const hasStructuredMeta = recipe.ingredientGroups.some(
    (g) =>
      g.name ||
      g.optional ||
      g.ingredients.some(
        (i) =>
          i.optional ||
          i.quantity_min !== null ||
          i.quantity_max !== null ||
          i.quantity_value !== null ||
          i.preparation ||
          i.alternative_group ||
          i.unit ||
          i.name,
      ),
  );
  const hasSections = recipe.ingredientGroups.length > 1 || hasStructuredMeta;
  const groups = hasSections
    ? recipe.ingredientGroups.map((g) => ({
        name: g.name ?? "",
        optional: g.optional ?? false,
        ingredients: g.ingredients.map((i) => ({
          display_text: i.display_text,
          optional: i.optional ?? false,
          quantity_min: i.quantity_min ?? null,
          quantity_max: i.quantity_max ?? null,
          alternative_group: i.alternative_group ?? null,
          preparation: i.preparation ?? null,
          quantity: i.quantity ?? null,
          unit: i.unit ?? null,
          name: i.name ?? null,
          quantity_value: i.quantity_value ?? null,
        })),
      }))
    : undefined;

  const initial: RecipeFormInitial = {
    title: recipe.title,
    description: recipe.description ?? "",
    servings: recipe.servings ?? "",
    prep_time: recipe.prep_time ?? "",
    cook_time: recipe.cook_time ?? "",
    source_url: recipe.source_url ?? "",
    ingredients: recipe.ingredients.map(ingredientLine),
    groups,
    steps: recipe.steps.map((s) => s.instruction),
    stepTitles: recipe.steps.map((s) => s.title),
    tips: recipe.tips.map((t) => t.text),
    coverUrl: recipe.coverUrl,
    calories: recipe.calories ?? "",
    protein: recipe.protein ?? "",
    carbs: recipe.carbs ?? "",
    fat: recipe.fat ?? "",
    fibre: recipe.fibre ?? "",
    sugar: recipe.sugar ?? "",
    nutrition_per_serving: recipe.nutrition_per_serving,
  };

  const boundUpdate = updateRecipe.bind(null, recipe.id);

  return (
    <>
      <AppHeader
        title="Edit recipe"
        action={
          <Link
            href={`/recipes/${recipe.id}`}
            aria-label="Cancel"
            className="grid h-[38px] w-[38px] place-items-center rounded-full border border-line bg-surface text-ink-2"
          >
            <CloseIcon size={18} />
          </Link>
        }
      />
      <RecipeForm action={boundUpdate} initial={initial} submitLabel="Save changes" />
    </>
  );
}
