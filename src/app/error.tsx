"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Hook point for an error monitor (e.g. Sentry) at deploy time.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col items-center justify-center px-6 text-center">
      <div aria-hidden className="mb-4 grid h-[70px] w-[70px] place-items-center rounded-[22px] bg-basil-tint text-[32px]">
        🍳
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
