"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { submitUrlImport } from "@/lib/import/actions";
import { createRecipe } from "@/lib/recipes/actions";
import { RecipeForm } from "@/components/recipes/recipe-form";
import { CoverImage } from "@/components/recipes/cover-image";
import { Button } from "@/components/ui/button";
import { LoadingLabel } from "@/components/ui/spinner";
import { SkeletonLines } from "@/components/ui/skeleton";
import { ImportNote } from "@/components/import/import-note";
import { ImportFailure } from "@/components/import/import-failure";
import { InstagramIcon, GlobeIcon, CheckIcon } from "@/components/icons";
import { extractedToFormInitial } from "@/lib/import/to-form";
import type { ImportResult, ExtractedRecipe } from "@/lib/import/schema";

const EXTRACTING_STEPS = ["Reading the recipe…", "Pulling out ingredients & steps…", "Tidying it up…"];
const STEP_INTERVAL_MS = 1200;

const IDLE: ImportResult = { phase: "processing", importId: "", state: "created" };

export function ImportFlow({
  source,
  onSaved,
  onNavigate,
}: {
  source: "instagram" | "web";
  onSaved?: (id: string) => void;
  onNavigate?: (href: string) => void;
}) {
  const keyRef = useRef<string>(crypto.randomUUID());
  const [state, action, pending] = useActionState<ImportResult, FormData>(submitUrlImport, IDLE);

  if (pending) return <Extracting />;

  if (state.phase === "exists") {
    return <AlreadyImported recipeId={state.recipeId} title={state.title} coverUrl={state.coverUrl} onNavigate={onNavigate} />;
  }
  if (state.phase === "ready") {
    return <Review recipe={state.recipe} source={source} onSaved={onSaved} />;
  }
  if (state.phase === "failed") {
    return <ImportFailure message={state.message} fallback={state.fallback} onNavigate={onNavigate} />;
  }

  return (
    <PasteForm
      action={(fd) => {
        fd.set("idempotencyKey", keyRef.current);
        action(fd);
      }}
      onEdit={() => (keyRef.current = crypto.randomUUID())}
      source={source}
    />
  );
}

function PasteForm({
  action,
  onEdit,
  source,
}: {
  action: (fd: FormData) => void;
  onEdit: () => void;
  source: "instagram" | "web";
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
          onChange={onEdit}
          placeholder={isInsta ? "Paste a Reel or post link" : "Paste a recipe URL"}
          className="w-full rounded-sm border border-line bg-surface-2 px-4 py-3.5 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-basil"
        />
      </div>
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
    const t = setInterval(() => setI((n) => Math.min(n + 1, EXTRACTING_STEPS.length - 1)), STEP_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <LoadingLabel>{EXTRACTING_STEPS[i]}</LoadingLabel>
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

function Review({
  recipe,
  source,
  onSaved,
}: {
  recipe: ExtractedRecipe;
  source: "instagram" | "web";
  onSaved?: (id: string) => void;
}) {
  const sourceType = recipe.source.sourceType.startsWith("instagram") ? "instagram" : "website";
  const cached = recipe.source.retrievalMethod === "cache";
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-basil-tint px-3 py-1.5 text-[12px] font-semibold text-basil">
          {source === "instagram" ? <InstagramIcon size={14} /> : <GlobeIcon size={14} />}
          {recipe.source.creatorName ? `@${recipe.source.creatorName}` : "Imported"}
          {cached ? " · from your history" : ""}
        </span>
      </div>
      <ImportNote>
        I filled in everything the source gave me. Nothing invented — anything missing is yours to add or leave.
      </ImportNote>
      <RecipeForm
        action={createRecipe}
        initial={extractedToFormInitial(recipe)}
        source={{ type: sourceType, url: recipe.source.sourceUrl ?? "", handle: recipe.source.creatorName }}
        submitLabel="Save to shelf"
        isNew
        onSaved={onSaved}
      />
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
  const inner = (
    <>
      <CoverImage url={coverUrl} title={title} className="h-[56px] w-[56px] flex-none rounded-xl" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-ink">{title}</span>
        <span className="block text-[12.5px] font-semibold text-basil">Open it</span>
      </span>
    </>
  );
  const className =
    "flex items-center gap-3.5 rounded-card border border-line bg-surface p-3 text-left transition-colors hover:border-basil hover:bg-basil-tint";
  return (
    <div className="flex flex-col gap-3.5 pb-1">
      <p className="flex items-center gap-2 rounded-sm bg-basil-tint px-4 py-3 text-[13.5px] font-medium text-basil">
        <CheckIcon size={16} /> You&apos;ve already imported this recipe.
      </p>
      {onNavigate ? (
        <button type="button" onClick={() => onNavigate(`/recipes/${recipeId}`)} className={className}>
          {inner}
        </button>
      ) : (
        <Link href={`/recipes/${recipeId}`} className={className}>
          {inner}
        </Link>
      )}
    </div>
  );
}
