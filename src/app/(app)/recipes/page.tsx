import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { SearchIcon } from "@/components/icons";

// M1 replaces this with the searchable, filterable recipe library.
export default function RecipesPage() {
  return (
    <>
      <AppHeader
        title="Recipes"
        action={
          <button
            aria-label="Search"
            className="grid h-[38px] w-[38px] place-items-center rounded-full border border-line bg-surface text-ink-2"
          >
            <SearchIcon size={18} />
          </button>
        }
      />
      <EmptyState
        emoji="📖"
        title="No recipes yet"
        action={
          <Link href="/add">
            <Button>Add a recipe</Button>
          </Link>
        }
      >
        Everything you save lands here — searchable, filterable, yours.
      </EmptyState>
    </>
  );
}
