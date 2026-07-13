import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { BookIcon } from "@/components/icons";
import { RecipeShelf } from "@/components/recipes/recipe-card";
import { FilterChips } from "@/components/recipes/filter-chips";
import { SearchBar } from "@/components/recipes/search-bar";
import { listRecipes, countRecipes } from "@/lib/recipes/queries";
import { firstName } from "@/lib/name";

export default async function ShelfPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { filter, q } = await searchParams;
  const favourite = filter === "favourites";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user!.id)
    .single();
  const name = firstName(profile?.display_name);

  const [total, recipes] = await Promise.all([
    countRecipes(),
    listRecipes({ favourite, search: q }),
  ]);

  if (total === 0) {
    return (
      <>
        <AppHeader title={`${name}'s Kitchen`} subtitle="Let's fill the shelf" />
        <EmptyState
          icon={<BookIcon size={30} />}
          title="Your shelf is empty"
          action={
            <Link href="/add">
              <Button>Add your first recipe</Button>
            </Link>
          }
        >
          Tap the + below to add your first recipe — paste a link from Instagram or any recipe site
          and it&apos;ll pull the recipe out. No more screenshots into ChatGPT.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <AppHeader
        title={`${name}'s Kitchen`}
        subtitle={`${total} recipe${total === 1 ? "" : "s"}`}
      />
      <SearchBar initial={q ?? ""} />
      <FilterChips active={favourite ? "favourites" : "all"} query={q} />

      {recipes.length > 0 ? (
        <RecipeShelf recipes={recipes} />
      ) : q ? (
        <p className="rounded-card border border-dashed border-line-2 bg-surface px-5 py-10 text-center text-sm text-ink-2">
          Nothing matches <span className="font-semibold text-ink">“{q}”</span>. Try a different word.
        </p>
      ) : (
        <p className="rounded-card border border-dashed border-line-2 bg-surface px-5 py-9 text-center text-sm text-ink-2">
          No favourites yet — tap the heart on a recipe to keep it here.
        </p>
      )}
    </>
  );
}
