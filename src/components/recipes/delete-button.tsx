"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteRecipe } from "@/lib/recipes/actions";
import { Button } from "@/components/ui/button";

/** Two-tap delete — no blocking browser dialog, reversible for 4 seconds. */
export function DeleteButton({ id }: { id: string }) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  if (armed) {
    return (
      <Button
        variant="danger"
        fullWidth
        loading={pending}
        onClick={() => startTransition(() => deleteRecipe(id))}
      >
        Tap again to delete
      </Button>
    );
  }

  return (
    <Button variant="ghost" fullWidth onClick={() => setArmed(true)}>
      Delete recipe
    </Button>
  );
}
