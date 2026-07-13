"use client";

import { useActionState } from "react";
import { extractPasted, type PasteState } from "@/lib/import/actions";
import { createRecipe } from "@/lib/recipes/actions";
import { RecipeForm, type RecipeFormInitial } from "@/components/recipes/recipe-form";
import { Button } from "@/components/ui/button";
import { ingredientLine } from "@/lib/recipes/ingredient";
import type { ExtractedRecipe } from "@/lib/import/types";

function toInitial(recipe: ExtractedRecipe): RecipeFormInitial {
  return {
    title: recipe.title,
    description: recipe.description ?? "",
    servings: recipe.servings ?? "",
    prep_time: recipe.prep_time ?? "",
    cook_time: recipe.cook_time ?? "",
    source_url: "",
    ingredients: recipe.ingredients.map(ingredientLine),
    steps: recipe.steps,
    tips: recipe.tips,
    coverUrl: null,
  };
}

export function PasteFlow() {
  const [state, action, pending] = useActionState<PasteState, FormData>(extractPasted, {
    phase: "idle",
  });

  if (pending) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2.5 text-[14px] font-semibold text-basil">
          <span
            aria-hidden
            className="h-[18px] w-[18px] animate-spin rounded-full border-[2.5px] border-basil-tint border-t-basil"
          />
          <span role="status">Reading your recipe…</span>
        </div>
        <div className="skeleton h-6 w-3/5" />
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 6 }).map((_, n) => (
            <div key={n} className="skeleton h-4" style={{ width: `${92 - (n % 3) * 14}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (state.phase === "done") {
    return (
      <div>
        <p className="mb-4 flex gap-2 rounded-[12px] border border-line bg-surface-2 px-3.5 py-2.5 text-[12.5px] leading-snug text-ink-2">
          Pulled from your text. Nothing invented — check it over and save.
        </p>
        <RecipeForm action={createRecipe} initial={toInitial(state.recipe)} submitLabel="Save to shelf" />
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <textarea
        name="text"
        autoFocus
        rows={11}
        aria-label="Recipe text"
        placeholder="Paste a recipe here — from ChatGPT, a blog, a note, anywhere. Any format works."
        className="w-full rounded-card border border-line bg-surface-2 px-4 py-3.5 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-3 focus:border-basil"
      />
      {state.phase === "error" && (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" fullWidth>
        Extract the recipe
      </Button>
      <p className="text-center text-[12px] leading-relaxed text-ink-3">
        No special format needed — I&apos;ll pull out the ingredients and steps.
      </p>
    </form>
  );
}
