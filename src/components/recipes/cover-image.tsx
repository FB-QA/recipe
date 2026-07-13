import { clsx } from "@/lib/clsx";

// Basil-friendly gradients for recipes without a photo — deterministic per
// title so a given recipe always wears the same colour.
const GRADIENTS = [
  "linear-gradient(135deg,#7FA98C,#3C6B52)",
  "linear-gradient(135deg,#E0A4A0,#B96A78)",
  "linear-gradient(135deg,#D8B26A,#B07C3E)",
  "linear-gradient(135deg,#8FB0B6,#4E7E82)",
  "linear-gradient(135deg,#A9BE8F,#5E7B4C)",
  "linear-gradient(135deg,#C99C88,#8A5A4B)",
];

export function gradientFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) & 0xffffffff;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export function CoverImage({
  url,
  title,
  className,
  children,
}: {
  url: string | null;
  title: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={clsx("relative flex items-end overflow-hidden bg-cover bg-center", className)}
      style={url ? { backgroundImage: `url(${url})` } : { backgroundImage: gradientFor(title) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />}
      {children}
    </div>
  );
}
