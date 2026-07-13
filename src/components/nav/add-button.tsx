"use client";

import { useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/ui/sheet";
import { ImportFlow } from "@/components/import/import-flow";
import { PasteFlow } from "@/components/import/paste-flow";
import { PlusIcon, InstagramIcon, GlobeIcon, ClipboardIcon, PencilIcon } from "@/components/icons";

type View = "menu" | "instagram" | "web" | "paste";

const TITLES: Record<View, string> = {
  menu: "Add a recipe",
  instagram: "Import from Instagram",
  web: "Import from website",
  paste: "Paste text",
};

const importOptions: { view: View; Icon: typeof InstagramIcon; title: string; sub: string }[] = [
  { view: "instagram", Icon: InstagramIcon, title: "Import from Instagram", sub: "Paste a Reel or post link" },
  { view: "web", Icon: GlobeIcon, title: "Import from website", sub: "Paste any recipe URL" },
  { view: "paste", Icon: ClipboardIcon, title: "Paste text", sub: "From ChatGPT, a blog, anywhere" },
];

// The nav and this drawer persist across navigation. AddButton is keyed by
// pathname in BottomNav, so it remounts (and the drawer resets/closes) when a
// flow saves and routes to the new recipe.
export function AddButton() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");

  const openMenu = () => {
    setView("menu");
    setOpen(true);
  };

  return (
    <>
      <button
        onClick={openMenu}
        aria-label="Add a recipe"
        aria-haspopup="dialog"
        className="-mt-7 flex flex-col items-center"
      >
        <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-basil text-white shadow-[0_6px_16px_color-mix(in_srgb,var(--basil)_45%,transparent)] transition-transform duration-150 active:scale-90">
          <PlusIcon size={26} />
        </span>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        onBack={view === "menu" ? undefined : () => setView("menu")}
        title={TITLES[view]}
      >
        {view === "menu" ? (
          <div className="flex flex-col gap-2.5">
            {importOptions.map(({ view: v, Icon, title, sub }) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="flex items-center gap-3.5 rounded-[15px] border border-line bg-surface p-[15px] text-left transition-colors hover:border-basil hover:bg-basil-tint"
              >
                <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-basil-tint text-basil">
                  <Icon size={21} />
                </span>
                <span>
                  <span className="block text-[15px] font-bold text-ink">{title}</span>
                  <span className="block text-[12.5px] text-ink-3">{sub}</span>
                </span>
              </button>
            ))}
            <Link
              href="/recipes/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3.5 rounded-[15px] border border-line bg-surface p-[15px] transition-colors hover:border-basil hover:bg-basil-tint"
            >
              <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-basil-tint text-basil">
                <PencilIcon size={21} />
              </span>
              <span>
                <span className="block text-[15px] font-bold text-ink">Create manually</span>
                <span className="block text-[12.5px] text-ink-3">Type it in yourself</span>
              </span>
            </Link>
          </div>
        ) : view === "paste" ? (
          <PasteFlow />
        ) : (
          <ImportFlow source={view === "instagram" ? "instagram" : "web"} />
        )}
      </Sheet>
    </>
  );
}
