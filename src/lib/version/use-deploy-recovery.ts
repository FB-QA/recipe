"use client";

import { useEffect } from "react";
import { canRecoveryReload, forceReload, guardedReload, isDeployError, updateSeen } from "./version";

/**
 * Shared recovery decision for the app's error boundaries (`error.tsx` and
 * `global-error.tsx`). Both face the identical question — is this a stale-build
 * deploy skew or a genuine fault, and what should the one manual button do? — so the
 * logic lives here once rather than being copied into each boundary's markup.
 *
 * It classifies the error, fires the single guarded auto-reload when recovery is
 * possible, and returns the correct manual action:
 *  - deploy skew we could NOT auto-recover → {@link forceReload} (only a hard reload
 *    fixes a build mismatch; `reset()` re-renders the same stale tree and dead-ends),
 *  - a genuine application error → `reset` (retry the render).
 *
 * Each boundary keeps its own presentation — `global-error.tsx` must inline its styles
 * because it replaces the whole document — but shares this decision.
 */
export function useDeployRecovery(error: Error, reset: () => void) {
  // Deploy-skew if the message looks like one OR we've already sniffed a newer version
  // off the wire — the latter catches Server-Action mismatches without depending on
  // their exact wording.
  const deploy = isDeployError(error) || updateSeen();
  // Only show the recovery spinner if a reload will actually fire — if we reloaded
  // moments ago (persistent error) or can't guard against a loop, surface the error
  // instead of spinning forever.
  const recovering = deploy && canRecoveryReload();

  useEffect(() => {
    if (deploy && canRecoveryReload()) guardedReload();
    else if (!deploy) console.error(error); // hook point for an error monitor
  }, [error, deploy]);

  return { deploy, recovering, recover: deploy ? forceReload : reset };
}
