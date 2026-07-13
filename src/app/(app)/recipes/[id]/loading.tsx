import { HeaderSkeleton, SkeletonLines, Skeleton, SKELETON_COUNT } from "@/components/ui/skeleton";

export default function RecipeLoading() {
  return (
    <>
      {/* the cover, then the title, then the method */}
      <Skeleton className="h-[200px] w-full rounded-card" />
      <div className="mt-3">
        <HeaderSkeleton />
      </div>
      <SkeletonLines count={SKELETON_COUNT.detailLines} />
    </>
  );
}
