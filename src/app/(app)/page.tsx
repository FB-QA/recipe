import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { SearchIcon, BookIcon } from "@/components/icons";
import { RecipeShelf } from "@/components/recipes/recipe-card";
import { FilterChips } from "@/components/recipes/filter-chips";
import { listRecipes, countRecipes } from "@/lib/recipes/queries";
import { firstName } from "@/lib/name";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
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

  const [total, recipes] = await Promise.all([countRecipes(), listRecipes({ favourite })]);

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
        action={
          <Link
            href="/recipes"
            aria-label="Search recipes"
            className="grid h-[38px] w-[38px] place-items-center rounded-full border border-line bg-surface text-ink-2"
          >
            <SearchIcon size={18} />
          </Link>
        }
      />
      <FilterChips active={favourite ? "favourites" : "all"} />
      <div className="mb-3 mt-1 text-[13px] font-bold uppercase tracking-[0.04em] text-ink-3">
        Your shelf
      </div>
      {recipes.length > 0 ? (
        <RecipeShelf recipes={recipes} />
      ) : (
        <p className="rounded-card border border-dashed border-line-2 bg-surface px-5 py-9 text-center text-sm text-ink-2">
          No favourites yet — tap the heart on a recipe to keep it here.
        </p>
      )}
    </>
  );
}
