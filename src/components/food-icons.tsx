import { categorize, type Category } from "@/lib/grocery/categorize";
import { foodImage } from "@/lib/grocery/food-image";

type IconProps = { size?: number; className?: string };

function svg({ size = 20, className }: IconProps, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

const Carrot = (p: IconProps) =>
  svg(
    p,
    <>
      <path d="M14 10 L6 18.5 C5 19.5 5 20.5 6 20.5 C8.5 20.5 12 19 14.5 15.5 C15.5 14 16 12 15 10 Z" />
      <path d="M14.5 7.2 C16 6.2 18 6.6 18.6 8.2 C17 8.7 15.4 8.2 14.5 7.2 Z" />
      <path d="M13 8.4 C12.8 6.4 13.8 4.8 15.4 4.2 C15.6 6.2 14.6 7.8 13 8.4 Z" />
      <path d="M13.6 8.6 L16 6.6" />
    </>,
  );

const Fish = (p: IconProps) =>
  svg(
    p,
    <>
      <path d="M4 12 C7 8.2 12 8.2 16 12 C12 15.8 7 15.8 4 12 Z" />
      <path d="M16 12 L20.5 8.8 L20.5 15.2 Z" />
      <circle cx="8" cy="11.4" r="0.9" fill="currentColor" stroke="none" />
    </>,
  );

const Milk = (p: IconProps) =>
  svg(
    p,
    <>
      <path d="M9 3 H15 V6 L16 8.5 V19.5 A1 1 0 0 1 15 20.5 H9 A1 1 0 0 1 8 19.5 V8.5 L9 6 Z" />
      <path d="M8 12.5 H16" />
    </>,
  );

const Bread = (p: IconProps) =>
  svg(
    p,
    <>
      <path d="M4 14 C4 10.2 7.2 8 12 8 C16.8 8 20 10.2 20 14 A2 2 0 0 1 18 16 H6 A2 2 0 0 1 4 14 Z" />
      <path d="M9 11 V15 M12 11 V15 M15 11 V15" />
    </>,
  );

const Jar = (p: IconProps) =>
  svg(
    p,
    <>
      <rect x="7" y="6.5" width="10" height="14" rx="2.2" />
      <path d="M7 11 H17" />
      <path d="M10 3.5 H14 V6.5 H10 Z" />
    </>,
  );

const Snowflake = (p: IconProps) =>
  svg(p, <path d="M12 3 V21 M3.5 12 H20.5 M6 6 L18 18 M18 6 L6 18" />);

const Bag = (p: IconProps) =>
  svg(
    p,
    <>
      <path d="M6 8 H18 L17 20 A1 1 0 0 1 16 21 H8 A1 1 0 0 1 7 20 Z" />
      <path d="M9 8 V6 A3 3 0 0 1 15 6 V8" />
    </>,
  );

const BY_CATEGORY: Record<Category, (p: IconProps) => React.ReactElement> = {
  Produce: Carrot,
  "Meat & Fish": Fish,
  "Dairy & Eggs": Milk,
  Bakery: Bread,
  Pantry: Jar,
  Frozen: Snowflake,
  Other: Bag,
};

export function CategoryIcon({ category, size, className }: { category: Category } & IconProps) {
  return BY_CATEGORY[category]({ size, className });
}

/** Line food icon inferred from an ingredient / grocery line's text. */
export function FoodIcon({ text, size, className }: { text: string } & IconProps) {
  return BY_CATEGORY[categorize(text)]({ size, className });
}

/**
 * Coloured food cutout for an ingredient / grocery line. Uses a bundled Twemoji
 * SVG when the food is recognised, else falls back to the monochrome line icon.
 */
export function FoodImage({ text, size = 20, className }: { text: string } & IconProps) {
  const src = foodImage(text);
  if (!src) return <FoodIcon text={text} size={size} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} loading="lazy" className={className} />
  );
}
