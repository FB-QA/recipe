"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { runImport, type ImportState } from "@/lib/import/actions";
import { createRecipe } from "@/lib/recipes/actions";
import { RecipeForm, type RecipeFormInitial } from "@/components/recipes/recipe-form";
import { CoverImage } from "@/components/recipes/cover-image";
import { Button } from "@/components/ui/button";
import { LoadingLabel } from "@/components/ui/spinner";
import { SkeletonLines } from "@/components/ui/skeleton";
import { ImportNote } from "@/components/import/import-note";
import { InstagramIcon, GlobeIcon, PlayIcon, CheckIcon } from "@/components/icons";
import { ingredientLine } from "@/lib/recipes/ingredient";
import type { ExtractedRecipe } from "@/lib/import/types";

const EXTRACTING_STEPS = [
  "Reading the recipe…",
  "Pulling out ingredients & steps…",
  "Tidying it up…",
];
const STEP_INTERVAL_MS = 1200;

/** An internal link that, inside a drawer, closes-then-navigates via the host
 * (onNavigate); on a standalone page it's a plain Link. */
function LeaveLink({
  href,
  onNavigate,
  className,
  children,
}: {
  href: string;
  onNavigate?: (href: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  if (onNavigate) {
    return (
      <button type="button" onClick={() => onNavigate(href)} className={className}>
        {children}
      </button>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function ImportFlow({
  source,
  onSaved,
  onNavigate,
}: {
  source: "instagram" | "web";
  onSaved?: (id: string) => void;
  /** In a drawer, internal links close-then-navigate through the host. */
  onNavigate?: (href: string) => void;
}) {
  const [state, action, pending] = useActionState<ImportState, FormData>(runImport, {
    phase: "idle",
  });

  if (pending) return <Extracting />;
  if (state.phase === "exists") {
    return (
      <AlreadyImported
        recipeId={state.recipeId}
        title={state.title}
        coverUrl={state.coverUrl}
        onNavigate={onNavigate}
      />
    );
  }
  if (state.phase === "done" && state.status === "success") {
    return (
      <Review
        recipe={state.recipe}
        sourceType={state.sourceType}
        sourceUrl={state.sourceUrl}
        method={state.method}
        onSaved={onSaved}
      />
    );
  }
  if (state.phase === "done" && state.status === "no_recipe") {
    return (
      <TeaserFallback
        message={state.message}
        mediaUrl={state.mediaUrl}
        sourceUrl={state.sourceUrl}
        onNavigate={onNavigate}
      />
    );
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
          className="w-full rounded-sm border border-line bg-surface-2 px-4 py-3.5 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-basil"
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
    const t = setInterval(
      () => setI((n) => Math.min(n + 1, EXTRACTING_STEPS.length - 1)),
      STEP_INTERVAL_MS,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <LoadingLabel>{EXTRACTING_STEPS[i]}</LoadingLabel>

      {/* A full-page shell of the review that's coming. */}
      <div className="skeleton h-[190px] rounded-card" />
      <div className="skeleton h-6 w-40 rounded-full" />
      <div className="flex flex-col gap-2">
        <div className="skeleton h-6 w-4/5" />
        <div className="skeleton h-6 w-3/5" />
      </div>
      <div className="flex gap-2">
        <div className="skeleton h-14 flex-1 rounded-[14px]" />
        <div className="skeleton h-14 flex-1 rounded-[14px]" />
        <div className="skeleton h-14 flex-1 rounded-[14px]" />
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="skeleton h-3 w-24" />
        <SkeletonLines />
      </div>
      <div className="skeleton h-12 w-full rounded-[14px]" />
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
    ingredients: recipe.ingredients.map(ingredientLine),
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
  onSaved,
}: {
  recipe: ExtractedRecipe;
  sourceType: "instagram" | "website";
  sourceUrl: string;
  method: string;
  onSaved?: (id: string) => void;
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
      <ImportNote>
        I filled in everything the source gave me. Nothing invented — anything missing is yours to
        add or leave.
      </ImportNote>
      <RecipeForm
        action={createRecipe}
        initial={extractedToInitial(recipe, sourceUrl)}
        source={{ type: sourceType, url: sourceUrl, handle: recipe.sourceHandle }}
        importCoverUrl={recipe.imageUrl}
        submitLabel="Save to shelf"
        isNew
        onSaved={onSaved}
      />
    </div>
  );
}

function TeaserFallback({
  message,
  mediaUrl,
  sourceUrl,
  onNavigate,
}: {
  message: string;
  mediaUrl: string | null;
  sourceUrl: string;
  onNavigate?: (href: string) => void;
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
        {onNavigate ? (
          <Button fullWidth onClick={() => onNavigate("/recipes/new")}>
            Add it manually
          </Button>
        ) : (
          <Link href="/recipes/new">
            <Button fullWidth>Add it manually</Button>
          </Link>
        )}
      </div>
    </div>
  );
}

function AlreadyImported({
  recipeId,
  title,
  coverUrl,
  onNavigate,
}: {
  recipeId: string;
  title: string;
  coverUrl: string | null;
  onNavigate?: (href: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3.5 pb-1">
      <p className="flex items-center gap-2 rounded-sm bg-basil-tint px-4 py-3 text-[13.5px] font-medium text-basil">
        <CheckIcon size={16} /> You&apos;ve already imported this recipe.
      </p>
      <LeaveLink
        href={`/recipes/${recipeId}`}
        onNavigate={onNavigate}
        className="flex items-center gap-3.5 rounded-card border border-line bg-surface p-3 text-left transition-colors hover:border-basil hover:bg-basil-tint"
      >
        <CoverImage
          url={coverUrl}
          title={title}
          className="h-[56px] w-[56px] flex-none rounded-xl"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-ink">{title}</span>
          <span className="block text-[12.5px] font-semibold text-basil">Open it</span>
        </span>
      </LeaveLink>
    </div>
  );
}
