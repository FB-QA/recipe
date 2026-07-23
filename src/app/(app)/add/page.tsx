import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { InstagramIcon, GlobeIcon, ClipboardIcon, PencilIcon } from "@/components/icons";

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

export default function AddPage() {
  return (
    <>
      <AppHeader title="Add a recipe" subtitle="Three ways in — pick one." />
      <div className="flex flex-col gap-2.5">
        {options.map(({ href, Icon, title, sub }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3.5 rounded-[15px] border border-line bg-surface p-[15px] transition-colors hover:border-basil hover:bg-basil-tint"
          >
            <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-basil-tint text-basil">
              <Icon size={21} />
            </span>
            <span>
              <span className="block text-base font-bold text-ink">{title}</span>
              <span className="block text-xs text-ink-3">{sub}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
