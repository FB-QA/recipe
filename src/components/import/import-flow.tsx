"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { runImport, type ImportState } from "@/lib/import/actions";
import { createRecipe } from "@/lib/recipes/actions";
import { RecipeForm, type RecipeFormInitial } from "@/components/recipes/recipe-form";
import { Button } from "@/components/ui/button";
import { InstagramIcon, GlobeIcon, PlayIcon } from "@/components/icons";
import type { ExtractedRecipe } from "@/lib/import/types";

const EXTRACTING_STEPS = [
  "Reading the recipe…",
  "Pulling out ingredients & steps…",
  "Tidying it up…",
];

export function ImportFlow({ source }: { source: "instagram" | "web" }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(runImport, {
    phase: "idle",
  });

  if (pending) return <Extracting />;
  if (state.phase === "done" && state.status === "success") {
    return <Review recipe={state.recipe} sourceType={state.sourceType} sourceUrl={state.sourceUrl} method={state.method} />;
  }
  if (state.phase === "done" && state.status === "no_recipe") {
    return <TeaserFallback message={state.message} mediaUrl={state.mediaUrl} sourceUrl={state.sourceUrl} />;
  }
  return (
    <PasteForm
      action={action}
      source={source}
      error={state.phase === "error" ? state.error : undefined}
    />
  );
}

function PasteForm({
  action,
  source,
  error,
}: {
  action: (fd: FormData) => void;
  source: "instagram" | "web";
  error?: string;
}) {
  const isInsta = source === "instagram";
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="rounded-card border border-line bg-surface p-4 shadow-[var(--shadow)]">
        <div className="mb-3 flex items-center gap-2 text-basil">
          {isInsta ? <InstagramIcon size={20} /> : <GlobeIcon size={20} />}
          <span className="text-[13px] font-semibold text-ink-2">
            {isInsta ? "Import from Instagram" : "Import from a website"}
          </span>
        </div>
        <input
          name="url"
          type="url"
          inputMode="url"
          autoFocus
          required
          aria-label="Recipe link"
          placeholder={isInsta ? "Paste a Reel or post link" : "Paste a recipe URL"}
          className="w-full rounded-[12px] border border-line bg-surface-2 px-4 py-3.5 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-basil"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="submit" fullWidth>
        Get the recipe
      </Button>
      <p className="text-center text-[12px] leading-relaxed text-ink-3">
        Deterministic first, AI only when needed — most imports cost a fraction of a cent.
      </p>
    </form>
  );
}

function Extracting() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, EXTRACTING_STEPS.length - 1)), 1200);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <div className="mb-4 mt-2 flex items-center gap-2.5 text-[14px] font-semibold text-basil">
        <span
          aria-hidden
          className="h-[18px] w-[18px] animate-spin rounded-full border-[2.5px] border-basil-tint border-t-basil"
        />
        <span role="status">{EXTRACTING_STEPS[i]}</span>
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="skeleton h-[150px] rounded-none" />
        <div className="flex flex-col gap-2.5 p-4">
          <div className="skeleton h-5 w-4/5" />
          <div className="skeleton h-3 w-2/5" />
          <div className="skeleton mt-1.5 h-3 w-11/12" />
          <div className="skeleton h-3 w-10/12" />
          <div className="skeleton h-3 w-3/5" />
        </div>
      </div>
    </div>
  );
}

function extractedToInitial(recipe: ExtractedRecipe, sourceUrl: string): RecipeFormInitial {
  return {
    title: recipe.title,
    description: recipe.description ?? "",
    servings: recipe.servings ?? "",
    prep_time: recipe.prep_time ?? "",
    cook_time: recipe.cook_time ?? "",
    source_url: sourceUrl,
    ingredients: recipe.ingredients.map(
      (i) => [i.quantity, i.unit, i.name].filter(Boolean).join(" ") || i.display_text,
    ),
    steps: recipe.steps,
    tips: recipe.tips,
    coverUrl: null,
  };
}

function Review({
  recipe,
  sourceType,
  sourceUrl,
  method,
}: {
  recipe: ExtractedRecipe;
  sourceType: "instagram" | "website";
  sourceUrl: string;
  method: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-basil-tint px-3 py-1.5 text-[12px] font-semibold text-basil">
          {sourceType === "instagram" ? <InstagramIcon size={14} /> : <GlobeIcon size={14} />}
          {recipe.sourceHandle ? `@${recipe.sourceHandle}` : "Imported"}
          {method === "cache" ? " · from your history" : ""}
        </span>
      </div>
      <p className="mb-4 flex gap-2 rounded-[12px] border border-line bg-surface-2 px-3.5 py-2.5 text-[12.5px] leading-snug text-ink-2">
        I filled in everything the source gave me. Nothing invented — anything missing is yours to
        add or leave.
      </p>
      <RecipeForm
        action={createRecipe}
        initial={extractedToInitial(recipe, sourceUrl)}
        source={{ type: sourceType, url: sourceUrl, handle: recipe.sourceHandle }}
        importCoverUrl={recipe.imageUrl}
        submitLabel="Save to shelf"
      />
    </div>
  );
}

function TeaserFallback({
  message,
  mediaUrl,
  sourceUrl,
}: {
  message: string;
  mediaUrl: string | null;
  sourceUrl: string;
}) {
  return (
    <div className="mt-2 rounded-card border border-line bg-surface p-6 text-center">
      <div aria-hidden className="mx-auto mb-4 grid h-[70px] w-[70px] place-items-center rounded-[22px] bg-basil-tint text-basil">
        <PlayIcon size={30} />
      </div>
      <h2 className="text-[17px] font-bold text-ink">The recipe&apos;s in the video</h2>
      <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-relaxed text-ink-2">{message}</p>
      <div className="mt-5 flex flex-col gap-2.5">
        <a href={mediaUrl ?? sourceUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" fullWidth>
            Open the video
          </Button>
        </a>
        <Link href="/recipes/new">
          <Button fullWidth>Add it manually</Button>
        </Link>
      </div>
    </div>
  );
}
