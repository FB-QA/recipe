"use client";

import { Button } from "@/components/ui/button";
import { AlertIcon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { useDeployRecovery } from "@/lib/version/use-deploy-recovery";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const { deploy, recovering, recover } = useDeployRecovery(error, reset);

  if (recovering) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col items-center justify-center px-6 text-center">
        <Spinner />
      </main>
    );
  }

  // A deploy-skew error we could NOT auto-recover (a reload fired moments ago, or storage
  // is blocked) is only ever fixed by a HARD reload onto the live build — the reason a
  // manual browser refresh was the only escape. `recover` is a force-reload here, framed
  // as an update rather than a fault.
  if (deploy) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col items-center justify-center px-6 text-center">
        <h1 className="text-[20px] font-bold text-ink">A new version is ready</h1>
        <p className="mt-2 text-[14px] text-ink-2">Reload to pick up the latest.</p>
        <div className="mt-6 w-full max-w-[240px]">
          <Button fullWidth onClick={recover}>
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
        <Button fullWidth onClick={recover}>
          Try again
        </Button>
      </div>
    </main>
  );
}
