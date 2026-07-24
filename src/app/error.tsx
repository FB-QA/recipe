"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertIcon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { canRecoveryReload, forceReload, guardedReload, isDeployError, updateSeen } from "@/lib/version/version";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  // Treat it as deploy-skew if the message looks like one OR we've already sniffed a
  // newer version off the wire — the latter catches Server-Action mismatches without
  // depending on their exact wording.
  const deploy = isDeployError(error) || updateSeen();
  // A stale client after a deploy recovers onto the new build with one reload instead of
  // a dead-end screen. Only show the recovery spinner if a reload will actually fire —
  // if we reloaded moments ago (persistent error) or can't guard against a loop, show
  // the real error instead of spinning forever.
  const recovering = deploy && canRecoveryReload();
  useEffect(() => {
    if (deploy && canRecoveryReload()) guardedReload();
    else if (!deploy) console.error(error); // hook point for an error monitor
  }, [error, deploy]);

  if (recovering) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col items-center justify-center px-6 text-center">
        <Spinner />
      </main>
    );
  }

  // A deploy-skew error we could NOT auto-recover (a reload fired moments ago, or storage
  // is blocked) is only ever fixed by a HARD reload onto the live build. reset() re-runs
  // the same stale render against a mismatched build and dead-ends — the reason a manual
  // browser refresh was the only escape. So for skew, the button force-reloads (unguarded
  // — a deliberate press is not a loop) and we frame it as an update, not a fault.
  if (deploy) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col items-center justify-center px-6 text-center">
        <h1 className="text-[20px] font-bold text-ink">A new version is ready</h1>
        <p className="mt-2 text-[14px] text-ink-2">Reload to pick up the latest.</p>
        <div className="mt-6 w-full max-w-[240px]">
          <Button fullWidth onClick={() => forceReload()}>
            Reload
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col items-center justify-center px-6 text-center">
      <div aria-hidden className="mb-4 grid h-[70px] w-[70px] place-items-center rounded-[22px] bg-basil-tint text-basil">
        <AlertIcon size={30} />
      </div>
      <h1 className="text-[20px] font-bold text-ink">That didn&apos;t go to plan</h1>
      <p className="mt-2 text-[14px] text-ink-2">
        Something went wrong our end. Give it another go.
      </p>
      <div className="mt-6 w-full max-w-[240px]">
        <Button fullWidth onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
