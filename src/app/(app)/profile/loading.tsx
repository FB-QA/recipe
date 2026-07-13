import { HeaderSkeleton, RowsSkeleton, Skeleton, SKELETON_COUNT } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <>
      <HeaderSkeleton subtitle={false} />
      {/* the identity card */}
      <Skeleton className="h-[84px] w-full rounded-card" />
      <div className="mt-2.5">
        <RowsSkeleton count={SKELETON_COUNT.profileRows} />
      </div>
    </>
  );
}
