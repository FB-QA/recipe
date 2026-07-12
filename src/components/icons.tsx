/**
 * Minimal line-icon set, inline SVG (no icon-font dependency, no external
 * requests). Stroke uses currentColor so colour is controlled by the parent.
 */
type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 24, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export const HomeIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
  </svg>
);

export const BookIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden>
    <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v16H7.5A2.5 2.5 0 0 0 5 20.5z" />
    <path d="M5 20.5A2.5 2.5 0 0 1 7.5 18H20" />
  </svg>
);

export const PlusIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const CartIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden>
    <path d="M3 4h2l2.4 12.2a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.8L21 8H6" />
    <circle cx="9.5" cy="20" r="1.1" />
    <circle cx="17.5" cy="20" r="1.1" />
  </svg>
);

export const UserIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6.5 8-6.5S20 17 20 21" />
  </svg>
);

export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </svg>
);

export const HeartIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <svg {...base(p)} fill={filled ? "currentColor" : "none"} aria-hidden>
    <path d="M12 20s-7-4.35-9.3-8.5C1.2 8.7 2.5 5.5 5.6 5.1c1.9-.24 3.5.9 4.4 2.2.9-1.3 2.5-2.44 4.4-2.2 3.1.4 4.4 3.6 2.9 6.4C19 15.65 12 20 12 20Z" />
  </svg>
);

export const InstagramIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17" cy="7" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const GlobeIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 3.8 6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-6-3.8-9S9.5 5.5 12 3Z" />
  </svg>
);

export const PencilIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden>
    <path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.8-2.8L5 17.2z" />
    <path d="M14.5 6.5 17.5 9.5" />
  </svg>
);

export const CheckIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden>
    <path d="m5 12.5 4.5 4.5L19 6" />
  </svg>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden>
    <path d="m15 5-7 7 7 7" />
  </svg>
);

export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
