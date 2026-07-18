"use client";

import { useEffect } from "react";
import { getImportStatus } from "@/lib/import/actions";
import type { ImportResult } from "@/lib/import/schema";

const POLL_INTERVAL_MS = 1500;

/**
 * Poll an in-flight import to completion (R2). A duplicate submit or a claim race
 * can return `phase: "processing"` for a row another request is still working —
 * the server action does not block on it. Without polling, the flow would drop
 * back to its input form and the original import would finish unseen. Pass
 * `importId = null` to disable (the idle state and terminal states do this).
 */
export function useImportPolling(importId: string | null, onResult: (r: ImportResult) => void) {
  useEffect(() => {
    if (!importId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const result = await getImportStatus(importId);
      if (!active) return;
      // Keep polling while the row is still being worked; hand back on any
      // terminal envelope (ready / failed / exists).
      if (result.phase === "processing") timer = setTimeout(tick, POLL_INTERVAL_MS);
      else onResult(result);
    };
    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [importId, onResult]);
}
