/**
 * A small visible marker for an approximate conversion (e.g. a density-derived
 * weight). Accessible text — not colour alone (spec §34) — with the assumption
 * ("assumes packed", "spooned & levelled") carried in the title/aria-label.
 */
export function ApproximateBadge({ note }: { note?: string }) {
  const label = note ?? "Approximate conversion";
  return (
    <span
      className="ml-1.5 inline-flex flex-none items-center rounded-full bg-surface-2 px-1.5 py-0.5 align-middle text-[10.5px] font-semibold text-ink-3"
      title={label}
      aria-label={label}
    >
      approx
    </span>
  );
}
