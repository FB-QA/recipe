import { SHELF_GRID, CARD_SHELL, CARD_COVER_H } from "@/components/recipes/recipe-card";

const LINE_MAX_WIDTH = 92; // widest line, %
const LINE_WIDTH_STEP = 14; // narrower per cycle position, %

/**
 * How many placeholders each skeleton draws. Enough to fill a phone screen — fewer
 * reads as broken, more paints rows nobody will ever see.
 */
export const SKELETON_COUNT = {
  shelfCards: 6,
  listRows: 5,
  profileRows: 4,
  detailLines: 7,
} as const;

/** A single shimmer block. `.skeleton` (globals.css) owns the animation. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton ${className ?? ""}`} aria-hidden />;
}

/** A block of shimmer lines with a natural ragged right edge. */
export function SkeletonLines({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: count }).map((_, n) => (
        <div
          key={n}
          className="skeleton h-4"
          style={{ width: `${LINE_MAX_WIDTH - (n % 3) * LINE_WIDTH_STEP}%` }}
        />
      ))}
    </div>
  );
}

/**
 * <AppHeader> in skeleton form. Every page opens with one, so every loading state
 * does too — the header must not jump when the real content lands.
 */
export function HeaderSkeleton({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="flex items-start justify-between px-0.5 pb-3.5 pt-2.5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-[22px] w-44" />
        {subtitle && <Skeleton className="h-[13px] w-24" />}
      </div>
    </div>
  );
}

/**
 * The recipe shelf, mid-load. It borrows the REAL grid and card classes from
 * recipe-card rather than restating them, so the placeholders occupy exactly the
 * space the cards will — nothing reflows when they arrive, and the two cannot drift
 * apart when either is edited.
 */
export function ShelfSkeleton({ count = SKELETON_COUNT.shelfCards }: { count?: number }) {
  return (
    <div className={SHELF_GRID}>
      {Array.from({ length: count }).map((_, n) => (
        <div key={n} className={CARD_SHELL}>
          <Skeleton className={`${CARD_COVER_H} rounded-none`} />
          <div className="flex flex-col gap-2 px-3 pb-3.5 pt-2.5">
            <Skeleton className="h-[14.5px] w-[85%]" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A stack of card-shaped rows — the grocery board, the profile's settings list. */
export function RowsSkeleton({ count, height = "h-[52px]" }: { count: number; height?: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: count }).map((_, n) => (
        <Skeleton key={n} className={`${height} w-full rounded-card`} />
      ))}
    </div>
  );
}
