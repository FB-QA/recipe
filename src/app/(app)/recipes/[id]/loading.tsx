import { DETAIL_COVER } from "@/components/recipes/cover-image";
import { Skeleton, SkeletonLines, SKELETON_COUNT } from "@/components/ui/skeleton";

/**
 * The recipe, mid-load.
 *
 * It borrows DETAIL_COVER — the page's OWN cover classes — rather than restating
 * them. The first version of this file guessed: 200px, rounded, inset within the
 * page padding, with a title bar below. The real cover is 250px, square, full-bleed
 * PAST the padding, with the title overlaid inside it. On load it would therefore
 * have grown 50px, shifted sideways, and moved the title — precisely the jump this
 * PR exists to remove, reintroduced on the one page nobody was looking at.
 *
 * Caught in review. Hence the shared constant: the two cannot now disagree.
 */
export default function RecipeLoading() {
  return (
    <div className="-mt-2">
      {/* The cover — and the title stands where the real one does: inside it. */}
      <div className={`${DETAIL_COVER} skeleton flex items-end rounded-none`} aria-hidden>
        <Skeleton className="h-[26px] w-[70%] bg-white/40" />
      </div>

      {/* The meta strip: three equal cards, as on the page. */}
      <div className="mt-4 flex gap-2">
        {Array.from({ length: 3 }).map((_, n) => (
          <Skeleton key={n} className="h-[62px] flex-1 rounded-[14px]" />
        ))}
      </div>

      <div className="mt-4">
        <SkeletonLines count={SKELETON_COUNT.detailLines} />
      </div>
    </div>
  );
}
