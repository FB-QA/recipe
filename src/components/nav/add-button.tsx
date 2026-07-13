"use client";

import { useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/ui/sheet";
import {
  PlusIcon,
  InstagramIcon,
  GlobeIcon,
  ClipboardIcon,
  PencilIcon,
} from "@/components/icons";

const options = [
  {
    href: "/import?source=instagram",
    Icon: InstagramIcon,
    title: "Import from Instagram",
    sub: "Paste a Reel or post link",
  },
  {
    href: "/import?source=web",
    Icon: GlobeIcon,
    title: "Import from website",
    sub: "Paste any recipe URL",
  },
  {
    href: "/paste",
    Icon: ClipboardIcon,
    title: "Paste text",
    sub: "From ChatGPT, a blog, anywhere",
  },
  {
    href: "/recipes/new",
    Icon: PencilIcon,
    title: "Create manually",
    sub: "Type it in yourself",
  },
];

export function AddButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Add a recipe"
        aria-haspopup="dialog"
        className="-mt-7 flex flex-col items-center"
      >
        <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-basil text-white shadow-[0_6px_16px_color-mix(in_srgb,var(--basil)_45%,transparent)] transition-transform duration-150 active:scale-90">
          <PlusIcon size={26} />
        </span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Add a recipe">
        <div className="flex flex-col gap-2.5">
          {options.map(({ href, Icon, title, sub }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3.5 rounded-[15px] border border-line bg-surface p-[15px] transition-colors hover:border-basil hover:bg-basil-tint"
            >
              <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-basil-tint text-basil">
                <Icon size={21} />
              </span>
              <span>
                <span className="block text-[15px] font-bold text-ink">{title}</span>
                <span className="block text-[12.5px] text-ink-3">{sub}</span>
              </span>
            </Link>
          ))}
        </div>
      </Sheet>
    </>
  );
}
