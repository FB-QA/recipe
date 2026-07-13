import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { CloseIcon } from "@/components/icons";
import { RecipeForm } from "@/components/recipes/recipe-form";
import { createRecipe } from "@/lib/recipes/actions";

export default function NewRecipePage() {
  return (
    <>
      <AppHeader
        title="New recipe"
        action={
          <Link
            href="/add"
            aria-label="Cancel"
            className="grid h-[38px] w-[38px] place-items-center rounded-full border border-line bg-surface text-ink-2"
          >
            <CloseIcon size={18} />
          </Link>
        }
      />
      <RecipeForm action={createRecipe} submitLabel="Save recipe" isNew />
    </>
  );
}
