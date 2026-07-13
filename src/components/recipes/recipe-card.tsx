import Link from "next/link";
import { CoverImage } from "./cover-image";
import { HeartIcon } from "@/components/icons";
import type { RecipeListItem } from "@/lib/recipes/queries";

const sourceLabel: Record<RecipeListItem["source_type"], string> = {
  instagram: "Instagram",
  website: "Web",
  manual: "Manual",
};

export function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="block overflow-hidden rounded-card border border-line bg-surface shadow-[var(--shadow)] transition-transform active:scale-[0.975]"
    >
      <CoverImage url={recipe.coverUrl} title={recipe.title} className="h-[118px] p-2.5">
        {recipe.is_favourite && (
          <span className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-white/85 text-heart">
            <HeartIcon size={14} filled />
          </span>
        )}
        {(recipe.source_handle || recipe.source_type !== "manual") && (
          <span className="relative max-w-[85%] truncate rounded-full bg-[rgba(20,28,22,0.55)] px-2 py-[3px] text-[10.5px] font-bold tracking-[0.03em] text-white backdrop-blur-sm">
            {recipe.source_handle ? `@${recipe.source_handle}` : sourceLabel[recipe.source_type]}
          </span>
        )}
      </CoverImage>
      <div className="px-3 pb-3.5 pt-2.5">
        <h3 className="text-[14.5px] font-bold leading-tight tracking-[-0.01em] text-ink [text-wrap:balance]">
          {recipe.title}
        </h3>
        <div className="mt-1.5 flex gap-2.5 text-xs text-ink-3">
          {recipe.servings && <span>Serves {recipe.servings}</span>}
          {recipe.ingredientCount > 0 && (
            <span>
              {recipe.ingredientCount} ingredient{recipe.ingredientCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function RecipeShelf({ recipes }: { recipes: RecipeListItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3.5">
      {recipes.map((r) => (
        <RecipeCard key={r.id} recipe={r} />
      ))}
    </div>
  );
}
