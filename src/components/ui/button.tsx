import { clsx } from "@/lib/clsx";

type Variant = "primary" | "ghost" | "danger";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[14px] font-bold transition-colors disabled:opacity-60 disabled:pointer-events-none active:scale-[0.985] select-none";

const sizes = {
  md: "px-4 py-[15px] text-[15px]",
  sm: "px-3 py-2 text-sm",
} as const;

const variants: Record<Variant, string> = {
  primary: "bg-basil text-white hover:bg-basil-2",
  ghost: "bg-transparent text-basil border border-line hover:bg-basil-tint",
  danger: "bg-transparent text-danger border border-line hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]",
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  loading,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: keyof typeof sizes;
  fullWidth?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      className={clsx(base, sizes[size], variants[variant], fullWidth && "w-full", className)}
      {...props}
      aria-busy={loading || undefined}
      disabled={loading || disabled}
    >
      {loading && (
        <span
          aria-hidden
          className="h-[16px] w-[16px] animate-spin rounded-full border-2 border-white/40 border-t-white"
        />
      )}
      {children}
    </button>
  );
}
