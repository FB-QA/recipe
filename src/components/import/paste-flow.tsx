"use client";

import { useActionState, useRef } from "react";
import { submitPasteImport } from "@/lib/import/actions";
import { createRecipe } from "@/lib/recipes/actions";
import { RecipeForm } from "@/components/recipes/recipe-form";
import { Button } from "@/components/ui/button";
import { LoadingLabel } from "@/components/ui/spinner";
import { SkeletonLines } from "@/components/ui/skeleton";
import { ImportNote } from "@/components/import/import-note";
import { extractedToFormInitial } from "@/lib/import/to-form";
import { ImportFailure } from "@/components/import/import-failure";
import type { ImportResult } from "@/lib/import/schema";

const IDLE: ImportResult = { phase: "processing", importId: "", state: "created" };

export function PasteFlow({ onSaved, onNavigate }: { onSaved?: (id: string) => void; onNavigate?: (href: string) => void }) {
  // The client owns the idempotency key: a double-submit re-sends the same key
  // (§22 / AC6); a fresh key is minted only when a new submission begins.
  const keyRef = useRef<string>(crypto.randomUUID());
  const [state, action, pending] = useActionState<ImportResult, FormData>(submitPasteImport, IDLE);

  if (pending) {
    return (
      <div className="flex flex-col gap-4">
        <LoadingLabel>Reading your recipe…</LoadingLabel>
        <div className="skeleton h-6 w-3/5" />
        <SkeletonLines />
      </div>
    );
  }

  if (state.phase === "ready") {
    return (
      <div>
        <ImportNote>Pulled from your text. Nothing invented — check it over and save.</ImportNote>
        <RecipeForm
          action={createRecipe}
          initial={extractedToFormInitial(state.recipe)}
          submitLabel="Save to shelf"
          isNew
          onSaved={onSaved}
        />
      </div>
    );
  }

  if (state.phase === "failed") {
    return <ImportFailure message={state.message} fallback={state.fallback} onNavigate={onNavigate} />;
  }

  return (
    <form
      action={(fd) => {
        fd.set("idempotencyKey", keyRef.current);
        action(fd);
      }}
      className="flex flex-col gap-4"
    >
      <textarea
        name="text"
        autoFocus
        rows={11}
        aria-label="Recipe text"
        onChange={() => (keyRef.current = crypto.randomUUID())}
        placeholder="Paste a recipe here — from ChatGPT, a blog, a note, anywhere. Any format works."
        className="w-full rounded-card border border-line bg-surface-2 px-4 py-3.5 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-3 focus:border-basil"
      />
      <Button type="submit" fullWidth>
        Extract the recipe
      </Button>
      <p className="text-center text-[12px] leading-relaxed text-ink-3">
        No special format needed — I&apos;ll pull out the ingredients and steps.
      </p>
    </form>
  );
}
