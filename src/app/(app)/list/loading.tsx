import { HeaderSkeleton, RowsSkeleton, SKELETON_COUNT } from "@/components/ui/skeleton";

export default function ListLoading() {
  return (
    <>
      <HeaderSkeleton subtitle={false} />
      <RowsSkeleton count={SKELETON_COUNT.listRows} />
    </>
  );
}
