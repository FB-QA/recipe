"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "@/components/icons";

export function SearchBar({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const mounted = useRef(false);

  useEffect(() => {
    // Don't navigate on first render — only when the user types.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const t = setTimeout(() => {
      const q = value.trim();
      router.replace(q ? `/?q=${encodeURIComponent(q)}` : "/");
    }, 300);
    return () => clearTimeout(t);
  }, [value, router]);

  return (
    <div className="mb-4 flex items-center gap-2.5 rounded-sm border border-line bg-surface px-3.5 py-3">
      <SearchIcon size={18} />
      <input
        type="search"
        inputMode="search"
        aria-label="Search recipes"
        placeholder="Search your recipes"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
      />
    </div>
  );
}
