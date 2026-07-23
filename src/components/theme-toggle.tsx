"use client";

import { useSyncExternalStore } from "react";
import { clsx } from "@/lib/clsx";

type Mode = "system" | "light" | "dark";
const MODES: Mode[] = ["system", "light", "dark"];
const LABEL: Record<Mode, string> = { system: "System", light: "Light", dark: "Dark" };

function readMode(): Mode {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("theme-change", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("theme-change", cb);
    window.removeEventListener("storage", cb);
  };
}

export function ThemeToggle() {
  // External client state — SSR snapshot is "system", real value read after mount.
  const mode = useSyncExternalStore(subscribe, readMode, () => "system" as Mode);

  const apply = (m: Mode) => {
    const root = document.documentElement;
    if (m === "system") {
      localStorage.removeItem("theme");
      root.removeAttribute("data-theme");
    } else {
      localStorage.setItem("theme", m);
      root.setAttribute("data-theme", m);
    }
    window.dispatchEvent(new Event("theme-change"));
  };

  return (
    <div role="radiogroup" aria-label="Appearance" className="flex gap-1 rounded-full border border-line bg-surface-2 p-1">
      {MODES.map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => apply(m)}
          className={clsx(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
            mode === m ? "bg-basil text-white" : "text-ink-2",
          )}
        >
          {LABEL[m]}
        </button>
      ))}
    </div>
  );
}
