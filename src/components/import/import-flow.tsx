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
import { isCompositeReelCover } from "@/lib/import/config";
import { useImportPolling } from "@/components/import/use-import-polling";
import { attributionLabel } from "@/lib/recipes/handle";
import type { ImportResult, ExtractedRecipe } from "@/lib/import/schema";

const EXTRACTING_STEPS = ["Reading the recipe…", "Pulling out ingredients & steps…", "Tidying it up…"];
const STEP_INTERVAL_MS = 1200;
/** Cap the background cover fetch so the shimmer never spins forever (spec Q3). */
const COVER_ENRICH_TIMEOUT_MS = 20_000;

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
  // A resolved poll overrides the action state: when a duplicate submit or claim
  // race returns an in-flight `processing` row, we poll it here to its terminal
  // envelope instead of dropping the user back to the input form.
  const [polled, setPolled] = useState<ImportResult | null>(null);
  const effective = polled ?? state;
  const inFlightId = effective.phase === "processing" && effective.importId ? effective.importId : null;
  useImportPolling(inFlightId, setPolled);

  if (pending || inFlightId) return <Extracting />;

  if (effective.phase === "exists") {
    return <AlreadyImported recipeId={effective.recipeId} title={effective.title} coverUrl={effective.coverUrl} onNavigate={onNavigate} />;
  }
  if (effective.phase === "ready") {
    return <Review recipe={effective.recipe} importId={effective.importId} source={source} onSaved={onSaved} />;
  }
  if (effective.phase === "failed") {
    return <ImportFailure message={effective.message} fallback={effective.fallback} onNavigate={onNavigate} />;
  }

  return (
    <PasteForm
      action={(fd) => {
        setPolled(null);
        fd.set("idempotencyKey", keyRef.current);
        action(fd);
      }}
      onEdit={() => {
        setPolled(null);
        keyRef.current = crypto.randomUUID();
      }}
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
  importId,
  source,
  onSaved,
}: {
  recipe: ExtractedRecipe;
  importId: string;
  source: "instagram" | "web";
  onSaved?: (id: string) => void;
}) {
  const sourceType = recipe.source.sourceType.startsWith("instagram") ? "instagram" : "website";
  const cached = recipe.source.retrievalMethod === "cache";
  const creatorLabel = attributionLabel(recipe.source.creatorName, { at: sourceType === "instagram" }) ?? "Imported";

  // Deferred Reel cover enrichment (spec: docs/spec/defer-cover-enrichment.md). The
  // pipeline handed us the play-button composite so we got here sooner; fetch the
  // clean Apify cover and swap it in. Saving does NOT cancel the run — the server
  // finishes it (kept alive with after()) and lands the clean cover on the import
  // while in review, or on the saved recipe if the run outran the save.
  const initialCover = recipe.source.coverImageUrl;
  const [coverUrl, setCoverUrl] = useState<string | null>(initialCover);
  const [coverEnriching, setCoverEnriching] = useState(() => isCompositeReelCover(initialCover));

  useEffect(() => {
    if (!isCompositeReelCover(initialCover)) return;
    const ctrl = new AbortController();
    const cap = setTimeout(() => ctrl.abort(), COVER_ENRICH_TIMEOUT_MS);
    (async () => {
      try {
        const res = await fetch(`/api/imports/${importId}/cover`, { method: "POST", signal: ctrl.signal });
        const data = (await res.json()) as { coverUrl: string | null };
        if (data?.coverUrl && !isCompositeReelCover(data.coverUrl)) setCoverUrl(data.coverUrl);
      } catch {
        // aborted (save/timeout) or failed — keep the composite, silently.
      } finally {
        clearTimeout(cap);
        setCoverEnriching(false);
      }
    })();
    return () => {
      clearTimeout(cap);
      ctrl.abort();
    };
  }, [importId, initialCover]);

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-basil-tint px-3 py-1.5 text-[12px] font-semibold text-basil">
          {source === "instagram" ? <InstagramIcon size={14} /> : <GlobeIcon size={14} />}
          {creatorLabel}
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
        importCoverUrl={coverUrl}
        coverEnriching={coverEnriching}
        importId={importId}
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
