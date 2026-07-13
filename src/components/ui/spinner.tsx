import { clsx } from "@/lib/clsx";

/** The single spinner used app-wide. `tone` picks the ring colour. */
export function Spinner({ size = 18, tone = "basil" }: { size?: number; tone?: "basil" | "white" }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={clsx(
        "inline-block animate-spin rounded-full border-[2.5px]",
        tone === "white" ? "border-white/40 border-t-white" : "border-basil-tint border-t-basil",
      )}
    />
  );
}

/** A spinner with a status label — the "reading your recipe…" import row. */
export function LoadingLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-[14px] font-semibold text-basil">
      <Spinner />
      <span role="status">{children}</span>
    </div>
  );
}
