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

  // A recipe with real sections (an import, or a multi-section recipe) edits in
  // grouped mode; a plain flat recipe stays on the simple list.
  const hasSections =
    recipe.ingredientGroups.length > 1 || Boolean(recipe.ingredientGroups[0]?.name);
  const groups = hasSections
    ? recipe.ingredientGroups.map((g) => ({
        name: g.name ?? "",
        ingredients: g.ingredients.map((i) => ({
          display_text: i.display_text,
          optional: i.optional ?? false,
          quantity_min: i.quantity_min ?? null,
          quantity_max: i.quantity_max ?? null,
          alternative_group: i.alternative_group ?? null,
          preparation: i.preparation ?? null,
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
