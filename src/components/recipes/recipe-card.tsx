import Link from "next/link";
import { CoverImage } from "./cover-image";
import { HeartIcon, UserIcon, ListIcon } from "@/components/icons";
import { parseServings } from "@/lib/recipes/scale";
import type { RecipeListItem } from "@/lib/recipes/queries";

const sourceLabel: Record<RecipeListItem["source_type"], string> = {
  instagram: "Instagram",
  website: "Web",
  manual: "Manual",
};

export function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  const serves = parseServings(recipe.servings);
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
        <div className="mt-2 flex items-center gap-3 text-xs font-medium text-ink-3">
          {serves !== null && (
            <span className="inline-flex items-center gap-1" title={`Serves ${serves}`}>
              <UserIcon size={13} /> {serves}
            </span>
          )}
          {recipe.ingredientCount > 0 && (
            <span className="inline-flex items-center gap-1" title={`${recipe.ingredientCount} ingredients`}>
              <ListIcon size={13} /> {recipe.ingredientCount}
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
