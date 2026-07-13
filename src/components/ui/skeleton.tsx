const LINE_MAX_WIDTH = 92; // widest line, %
const LINE_WIDTH_STEP = 14; // narrower per cycle position, %

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
