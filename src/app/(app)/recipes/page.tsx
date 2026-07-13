import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { RecipeShelf } from "@/components/recipes/recipe-card";
import { SearchBar } from "@/components/recipes/search-bar";
import { BookIcon } from "@/components/icons";
import { listRecipes } from "@/lib/recipes/queries";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const recipes = await listRecipes({ search: q });

  return (
    <>
      <AppHeader title="Recipes" />
      <SearchBar initial={q ?? ""} />

      {recipes.length > 0 ? (
        <RecipeShelf recipes={recipes} />
      ) : q ? (
        <p className="rounded-card border border-dashed border-line-2 bg-surface px-5 py-10 text-center text-sm text-ink-2">
          Nothing matches <span className="font-semibold text-ink">“{q}”</span>. Try a different word.
        </p>
      ) : (
        <EmptyState
          icon={<BookIcon size={30} />}
          title="No recipes yet"
          action={
            <Link href="/add">
              <Button>Add a recipe</Button>
            </Link>
          }
        >
          Everything you save lands here — searchable, filterable, yours.
        </EmptyState>
      )}
    </>
  );
}
