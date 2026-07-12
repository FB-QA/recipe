"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CartIcon, CheckIcon } from "@/components/icons";
import { addRecipeToList } from "@/lib/grocery/actions";

export function AddToListButton({ recipeId }: { recipeId: string }) {
  const [pending, startTransition] = useTransition();
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const router = useRouter();

  if (addedCount !== null) {
    return (
      <Button variant="ghost" fullWidth onClick={() => router.push("/list")}>
        <CheckIcon size={18} /> Added {addedCount} item{addedCount === 1 ? "" : "s"} — view list
      </Button>
    );
  }

  return (
    <Button
      fullWidth
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await addRecipeToList(recipeId);
          setAddedCount(result.count);
        })
      }
    >
      <CartIcon size={18} /> Add all to grocery list
    </Button>
  );
}
