/** The Cookdex mark — a basil leaf on a rounded tile, matching the app icon. */
export function Logo({ size = 76 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="grid place-items-center rounded-[24px] shadow-[var(--shadow)]"
      style={{ width: size, height: size, background: "var(--basil)" }}
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 512 512" fill="none">
        <path
          d="M256 116 C 366 158, 386 322, 256 404 C 126 322, 146 158, 256 116 Z"
          fill="#ffffff"
        />
        <path d="M256 150 L256 384" stroke="var(--basil)" strokeWidth={16} strokeLinecap="round" />
        <path
          d="M256 236 L322 202 M256 288 L322 254 M256 236 L190 202 M256 288 L190 254"
          stroke="var(--basil)"
          strokeWidth={12}
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
