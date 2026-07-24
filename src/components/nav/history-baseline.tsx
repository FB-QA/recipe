"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { captureHistoryBaseline, markNavigation } from "@/lib/nav/history-baseline";

/**
 * Tracks the app's position in session history so {@link BackButton} can tell a genuine
 * in-app back from a cold entry. Renders nothing; mount once at the root, before any
 * navigation.
 *
 * - captures the entry-point baseline on first mount,
 * - reconciles position on every forward navigation (pathname change),
 * - reconciles on back/forward (popstate) too, since those don't change the pathname
 *   via a push.
 */
export function HistoryBaseline() {
  const pathname = usePathname();

  useEffect(() => {
    captureHistoryBaseline();
  }, []);

  useEffect(() => {
    markNavigation();
  }, [pathname]);

  useEffect(() => {
    const onPopState = () => markNavigation();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return null;
}
