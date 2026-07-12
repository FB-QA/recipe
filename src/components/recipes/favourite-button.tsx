"use client";

import { useState, useTransition } from "react";
import { HeartIcon } from "@/components/icons";
import { toggleFavourite } from "@/lib/recipes/actions";
import { clsx } from "@/lib/clsx";

export function FavouriteButton({
  id,
  initial,
  variant = "overlay",
}: {
  id: string;
  initial: boolean;
  variant?: "overlay" | "inline";
}) {
  const [fav, setFav] = useState(initial);
  const [, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={fav}
      aria-label={fav ? "Remove from favourites" : "Add to favourites"}
      onClick={() => {
        const next = !fav;
        setFav(next);
        startTransition(() => toggleFavourite(id, next));
      }}
      className={clsx(
        "grid place-items-center transition-transform active:scale-90",
        variant === "overlay"
          ? "h-[38px] w-[38px] rounded-full bg-white/85 text-heart"
          : "h-9 w-9 text-heart",
      )}
    >
      <HeartIcon size={18} filled={fav} />
    </button>
  );
}
