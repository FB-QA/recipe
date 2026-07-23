import Link from "next/link";
import { clsx } from "@/lib/clsx";

export function FilterChips({ active, query }: { active: string; query?: string }) {
  const q = query ? `q=${encodeURIComponent(query)}` : "";
  const chips = [
    { key: "all", label: "All", href: q ? `/?${q}` : "/" },
    { key: "favourites", label: "Favourites", href: `/?filter=favourites${q ? `&${q}` : ""}` },
  ];

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1.5 pt-0.5 [scrollbar-width:none]">
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          aria-current={active === chip.key ? "true" : undefined}
          className={clsx(
            "flex-none rounded-full border px-3.5 py-[7px] text-sm font-semibold transition-colors",
            active === chip.key
              ? "border-basil bg-basil text-white"
              : "border-line bg-surface text-ink-2",
          )}
        >
          {chip.label}
        </Link>
      ))}
    </div>
  );
}
