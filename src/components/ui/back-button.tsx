"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { hasInAppHistory } from "@/lib/nav/history-baseline";

/**
 * A true history-back control.
 *
 * A `<Link href="...">` "back" button is a lie: it is a FORWARD navigation to a
 * URL, so it re-renders the target from the server and lands at scroll-top —
 * never restoring the page you actually came from. `router.back()` pops history
 * instead, so Next serves the previous page from the client Router Cache with its
 * tree AND scroll position intact: instant, no round-trip, no jump.
 *
 * When there is no in-app history to return to — a deep link, a shared URL, or a
 * link opened in a tab that already had browsing history — there is nothing of
 * ours to pop, so it navigates to `fallbackHref` rather than stepping the user
 * out to whatever external page preceded the app. `hasInAppHistory()` is that
 * signal: it measures growth beyond the history depth captured at app load, so it
 * counts only OUR navigations, not the tab's prior session (which
 * `window.history.length` alone cannot distinguish).
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
    if (hasInAppHistory()) router.back();
    else router.push(fallbackHref);
  };

  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={className}>
      {children}
    </button>
  );
}
