import Link from "next/link";
import { CoverImage } from "./cover-image";
import { HeartIcon, UserIcon, ListIcon } from "@/components/icons";
import { parseServings } from "@/lib/recipes/scale";
import { attributionLabel } from "@/lib/recipes/handle";
import type { RecipeListItem } from "@/lib/recipes/queries";

const sourceLabel: Record<RecipeListItem["source_type"], string> = {
  instagram: "Instagram",
  website: "Web",
  manual: "Manual",
};

/**
 * The shelf's layout, shared with its loading skeleton (`ShelfSkeleton`). Exported
 * rather than written twice: a skeleton with its own copy of the grid drifts from
 * the real thing the first time either is touched, and then the page jumps as it
 * loads. One definition, so they cannot disagree.
 */
export const SHELF_GRID = "grid grid-cols-2 gap-3.5";
export const CARD_SHELL =
  "block overflow-hidden rounded-card border border-line bg-surface shadow-[var(--shadow)]";
export const CARD_COVER_H = "h-[118px]";

export function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  const serves = parseServings(recipe.servings);
  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className={`${CARD_SHELL} transition-transform duration-150 active:scale-[0.97]`}
    >
      <CoverImage url={recipe.coverUrl} title={recipe.title} className={`${CARD_COVER_H} p-2.5`}>
        {recipe.is_favourite && (
          <span className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-white/85 text-heart">
            <HeartIcon size={14} filled />
          </span>
        )}
        {(recipe.source_handle || recipe.source_type !== "manual") && (
          <span className="relative max-w-[85%] truncate rounded-full bg-[rgba(20,28,22,0.55)] px-2 py-[3px] text-[10.5px] font-bold tracking-[0.03em] text-white backdrop-blur-sm">
            {recipe.source_handle
              ? attributionLabel(recipe.source_handle, { at: recipe.source_type === "instagram" })
              : sourceLabel[recipe.source_type]}
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
    <div className={SHELF_GRID}>
      {recipes.map((r, i) => (
        <div key={r.id} className="reveal-item" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
          <RecipeCard recipe={r} />
        </div>
      ))}
    </div>
  );
}
