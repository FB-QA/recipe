"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertIcon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { guardedReload, isDeployError, recentlyReloaded, updateSeen } from "@/lib/version/version";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  // Treat it as deploy-skew if the message looks like one OR we've already sniffed a
  // newer version off the wire — the latter catches Server-Action mismatches without
  // depending on their exact wording.
  const deploy = isDeployError(error) || updateSeen();
  // A stale client after a deploy throws a chunk/module error — recover onto the new
  // build with one reload instead of a dead-end screen. If we already reloaded moments
  // ago the error is genuinely persistent, so show it rather than spin forever.
  const recovering = deploy && !recentlyReloaded();
  useEffect(() => {
    if (deploy && !recentlyReloaded()) guardedReload();
    else if (!deploy) console.error(error); // hook point for an error monitor
  }, [error, deploy]);

  if (recovering) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col items-center justify-center px-6 text-center">
        <Spinner />
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
