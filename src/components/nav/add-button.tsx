"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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

export function AddButton() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Safety net: if the drawer is open and the route changes by any other means
  // (e.g. a bottom-nav tap), close it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close ephemeral drawer on route change
    setOpen(false);
  }, [pathname]);

  const openMenu = () => {
    setView("menu");
    setOpen(true);
  };

  // Global rule: a drawer action closes the sheet (animating), then navigates
  // once the slide-down completes — navigation never closes the drawer.
  const leave = (href: string) => {
    setPendingNav(href);
    setOpen(false);
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
        tall={view !== "menu"}
        onExitComplete={() => {
          if (pendingNav) {
            router.push(pendingNav);
            setPendingNav(null);
          }
        }}
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
            <button
              onClick={() => leave("/recipes/new")}
              className="flex items-center gap-3.5 rounded-[15px] border border-line bg-surface p-[15px] text-left transition-colors hover:border-basil hover:bg-basil-tint"
            >
              <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-basil-tint text-basil">
                <PencilIcon size={21} />
              </span>
              <span>
                <span className="block text-[15px] font-bold text-ink">Create manually</span>
                <span className="block text-[12.5px] text-ink-3">Type it in yourself</span>
              </span>
            </button>
          </div>
        ) : view === "paste" ? (
          <PasteFlow onSaved={(id) => leave(`/recipes/${id}?created=1`)} />
        ) : (
          <ImportFlow
            source={view === "instagram" ? "instagram" : "web"}
            onSaved={(id) => leave(`/recipes/${id}?created=1`)}
          />
        )}
      </Sheet>
    </>
  );
}
