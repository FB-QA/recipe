"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A true history-back control.
 *
 * A `<Link href="...">` "back" button is a lie: it is a FORWARD navigation to a
 * URL, so it re-renders the target from the server and lands at scroll-top —
 * never restoring the page you actually came from. `router.back()` pops history
 * instead, so Next serves the previous page from the client Router Cache with its
 * tree AND scroll position intact: instant, no round-trip, no jump.
 *
 * When there is no in-app history to return to — a deep link, a shared URL, a
 * fresh tab — there is nothing to pop, so it navigates to `fallbackHref` rather
 * than stranding the user (or stepping back to whatever external page preceded
 * the app). `history.length > 1` is that signal: more than the single entry a
 * cold load starts with.
 */
export function BackButton({
  fallbackHref = "/",
  className,
  "aria-label": ariaLabel = "Back",
  children,
}: {
  fallbackHref?: string;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  const onClick = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(fallbackHref);
  };

  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={className}>
      {children}
    </button>
  );
}
