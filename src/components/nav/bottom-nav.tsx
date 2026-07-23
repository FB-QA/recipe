"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/clsx";
import { BookIcon, CalendarIcon, CartIcon, UserIcon } from "@/components/icons";
import { AddButton } from "@/components/nav/add-button";

const items = [
  {
    href: "/",
    label: "Recipes",
    Icon: BookIcon,
    match: (p: string) => p === "/" || p.startsWith("/recipes"),
  },
  { href: "/plan", label: "Plan", Icon: CalendarIcon, match: (p: string) => p.startsWith("/plan") },
  { href: "/list", label: "List", Icon: CartIcon, match: (p: string) => p.startsWith("/list") },
  { href: "/profile", label: "Profile", Icon: UserIcon, match: (p: string) => p.startsWith("/profile") },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex h-[76px] max-w-[var(--width-app)] items-center justify-around border-t border-line bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] pb-2.5 backdrop-blur-lg"
    >
      {items.slice(0, 2).map((item) => (
        <NavLink key={item.href} {...item} active={item.match(pathname)} />
      ))}

      <AddButton />

      {items.slice(2).map((item) => (
        <NavLink key={item.href} {...item} active={item.match(pathname)} />
      ))}
    </nav>
  );
}

function NavLink({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: (p: { size?: number }) => React.ReactElement;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "flex w-16 flex-col items-center gap-[3px] text-2xs font-semibold transition-colors",
        active ? "text-basil" : "text-ink-3",
      )}
    >
      <Icon size={22} />
      {label}
    </Link>
  );
}
