"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";

/** Fires a one-off "saved" toast when a recipe page is opened just after
 * creation (?created=1), then strips the flag from the URL. */
export function SavedToast({ recipeId, message }: { recipeId: string; message: string }) {
  const toast = useToast();
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return; // guard StrictMode / re-invoke double-fire
    fired.current = true;
    toast(message);
    router.replace(`/recipes/${recipeId}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
