/** Tiny classnames joiner — no dependency needed for this. */
export function clsx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
