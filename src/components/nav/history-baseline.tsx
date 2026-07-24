"use client";

import { useEffect } from "react";
import { captureHistoryBaseline } from "@/lib/nav/history-baseline";

/**
 * Records the tab's history depth at app load, once, so {@link BackButton} can tell an
 * in-app back from a cold entry. Renders nothing; mount once at the root, before any
 * navigation. The effect runs on first mount — before the user can interact — so the
 * captured baseline is the document's load-time depth.
 */
export function HistoryBaseline() {
  useEffect(() => {
    captureHistoryBaseline();
  }, []);
  return null;
}
