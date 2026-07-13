import { HeaderSkeleton, ShelfSkeleton } from "@/components/ui/skeleton";

/**
 * The shelf, mid-load.
 *
 * WHY THIS FILE EXISTS AT ALL. Without a `loading.tsx`, an App Router navigation to
 * a dynamic page shows NOTHING — the old page simply sits there until the server
 * finishes. Measured at 350–660ms per click, that reads as a frozen app rather than
 * a loading one. It also gives Next a static shell to prefetch, which a dynamic
 * route otherwise has none of.
 */
export default function ShelfLoading() {
  return (
    <>
      <HeaderSkeleton />
      <ShelfSkeleton />
    </>
  );
}
