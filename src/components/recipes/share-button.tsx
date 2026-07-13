"use client";

import { useState } from "react";
import { ShareIcon, CheckIcon } from "@/components/icons";
import { recipeToText, type ShareableRecipe } from "@/lib/recipes/share";

export function ShareButton({ recipe }: { recipe: ShareableRecipe }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const text = recipeToText(recipe);

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: recipe.title, text });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // user cancelled
        // otherwise fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // nothing we can do; leave silently
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      aria-label="Share recipe"
      className="grid h-[38px] w-[38px] place-items-center rounded-full bg-white/85 text-ink transition-transform active:scale-90"
    >
      {copied ? <CheckIcon size={16} /> : <ShareIcon size={16} />}
    </button>
  );
}
