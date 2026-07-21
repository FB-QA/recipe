import Link from "next/link";
import { CoverImage } from "./cover-image";
import { HeartIcon, UserIcon, ListIcon, ClockIcon } from "@/components/icons";
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

/**
 * The title's reserved two-line box: font size, leading, and a `min-height` of two
 * of this element's own line-heights. `min-h-[2lh]` reserves exactly two lines so a
 * one-line title is the same height as a two-line one and the grid never staggers;
 * the `lh` unit tracks whatever `leading-tight` resolves to, so there is no second
 * value to keep in sync. Exported because the loading skeleton (`ShelfSkeleton`)
 * reserves the identical box — otherwise a single-line card visibly grows when the
 * placeholder resolves, the very reflow the shared-class pattern exists to prevent.
 */
export const CARD_TITLE_BOX = "min-h-[2lh] text-[14.5px] leading-tight";

/**
 * The title clamp and its reserved box are one decision: `line-clamp-2` gives the
 * ellipsis, `CARD_TITLE_BOX` reserves the two lines it clamps to.
 */
const CARD_TITLE = `line-clamp-2 ${CARD_TITLE_BOX} font-bold tracking-[-0.01em] text-ink [text-wrap:balance]`;

/**
 * One meta item — an icon and its value — defined once rather than per stat, so the
 * icon size and the icon/label spacing cannot drift between serves, ingredients, and
 * cook time. Per-item layout (whether it may shrink) is passed in via `className`.
 */
const META_ICON_SIZE = 13;

function MetaItem({
  icon: Icon,
  label,
  className,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`} title={label}>
      <Icon size={META_ICON_SIZE} className="shrink-0" />
      {children}
    </span>
  );
}

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
        <h3 className={CARD_TITLE}>{recipe.title}</h3>
        <div className="mt-2 flex items-center gap-3 text-xs font-medium text-ink-3">
          {serves !== null && (
            <MetaItem icon={UserIcon} label={`Serves ${serves}`} className="shrink-0">
              {serves}
            </MetaItem>
          )}
          {recipe.ingredientCount > 0 && (
            <MetaItem
              icon={ListIcon}
              label={`${recipe.ingredientCount} ingredients`}
              className="shrink-0"
            >
              {recipe.ingredientCount}
            </MetaItem>
          )}
          {recipe.cook_time && (
            <MetaItem icon={ClockIcon} label={`Cook time ${recipe.cook_time}`} className="min-w-0">
              <span className="truncate">{recipe.cook_time}</span>
            </MetaItem>
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
        <div key={r.id} className="reveal-item" style={{ transitionDelay: `${Math.min(i, 12) * 40}ms` }}>
          <RecipeCard recipe={r} />
        </div>
      ))}
    </div>
  );
}
