"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth/session";
import { signStoragePaths } from "@/lib/supabase/storage";
import { importBlocked } from "./limit";
import { importConfig } from "./config";
import { buildResolverChain, selectPrimaryProvider } from "./registry";
import { runImportPipeline, type EngineOutcome } from "./engine";
import { messageForFailure } from "./messages";
import {
  claimImport,
  createImportStore,
  failStale,
  isStale,
  loadPrices,
  readByIdempotencyKey,
  readById,
  readCachedByUrl,
  type ImportRow,
} from "./store";
import { classifyInstagramUrl } from "./resolvers/instagram-direct";
import { createApifyResolver } from "./resolvers/apify";
import type { ImportFailureReason, ImportRequest, ImportResult, RecipeImportSourceType } from "./schema";

/**
 * The server-action surface (api.md). Auth → policy → idempotency claim →
 * pipeline → one `ImportResult` envelope. Domain failures never throw; only the
 * signed-out path uses the existing throw convention. The client generates the
 * idempotency key (§22 / AC6) — a double submit re-sends it and the second
 * request returns the first's result or in-flight status.
 */

const uuid = z.string().uuid();

function outcomeToResult(importId: string, outcome: EngineOutcome): ImportResult {
  if (outcome.kind === "ready") {
    return {
      phase: "ready",
      importId,
      recipe: outcome.recipe,
      qualityScore: outcome.qualityScore,
      warnings: outcome.warnings,
    };
  }
  const { message, fallback } = messageForFailure(outcome.failureReason);
  return { phase: "failed", importId, failureReason: outcome.failureReason, message, fallback };
}

/** Map a persisted import row (idempotency hit / status poll) to the envelope. */
function rowToResult(row: ImportRow): ImportResult {
  if ((row.state === "ready_for_review" || row.state === "saved") && row.extracted) {
    return {
      phase: "ready",
      importId: row.id,
      recipe: row.extracted,
      qualityScore: row.quality_score ?? 0,
      warnings: row.extracted.warnings ?? [],
    };
  }
  if (row.state === "failed") {
    const reason = row.failure_reason ?? "unknown_error";
    const { message, fallback } = messageForFailure(reason);
    return { phase: "failed", importId: row.id, failureReason: reason, message, fallback };
  }
  return { phase: "processing", importId: row.id, state: row.state ?? "created" };
}

function failed(reason: ImportFailureReason, importId: string | null = null): ImportResult {
  const { message, fallback } = messageForFailure(reason);
  return { phase: "failed", importId, failureReason: reason, message, fallback };
}

async function resolveIdempotencyHit(userId: string, key: string): Promise<ImportResult | null> {
  const existing = await readByIdempotencyKey(userId, key);
  if (!existing) return null;
  if (isStale(existing)) {
    await failStale(existing);
    return failed("unknown_error", existing.id);
  }
  return rowToResult(existing);
}

async function runPipelineFor(request: ImportRequest): Promise<ImportResult> {
  const config = importConfig();
  const prices = await loadPrices();
  const chain = buildResolverChain(request, config);
  const provider = selectPrimaryProvider(config);
  const store = createImportStore(prices);
  // Reel cover enrichment (Freddi-approved): a clean Apify displayUrl replaces
  // the play-button composite the direct rung returns. Only wired when Apify is
  // configured; the engine gates it to composite Reel covers.
  const coverEnricher = config.apifyToken
    ? (req: ImportRequest) => createApifyResolver().resolve(req, { previousEvidence: [] })
    : undefined;
  const outcome = await runImportPipeline(request, { config, chain, provider, store, coverEnricher });
  return outcomeToResult(request.importId, outcome);
}

// ------------------------------------------------------------------
// submitUrlImport — website + Instagram
// ------------------------------------------------------------------

export async function submitUrlImport(_prev: ImportResult | undefined, formData: FormData): Promise<ImportResult> {
  const url = z.string().url().safeParse(String(formData.get("url") ?? "").trim());
  const key = uuid.safeParse(String(formData.get("idempotencyKey") ?? ""));
  if (!url.success || !key.success) return failed("invalid_input");

  const user = await currentUser();
  if (!user) return failed("unauthenticated");
  const supabase = await createClient();

  // Idempotency (R1) — a re-submit returns the first attempt's outcome.
  const hit = await resolveIdempotencyHit(user.id, key.data);
  if (hit) return hit;

  // Already saved this URL? Send them to it (existing behaviour).
  const { data: existingRecipe } = await supabase
    .from("recipes")
    .select("id, title, cover_image_path")
    .eq("source_url", url.data)
    .limit(1)
    .maybeSingle();
  if (existingRecipe) {
    const covers = await signStoragePaths(supabase, [existingRecipe.cover_image_path]);
    return {
      phase: "exists",
      recipeId: existingRecipe.id,
      title: existingRecipe.title,
      coverUrl: existingRecipe.cover_image_path ? (covers[existingRecipe.cover_image_path] ?? null) : null,
    };
  }

  // Cache (R3) — a previously accepted extraction of this URL is reused free.
  const cached = await readCachedByUrl(user.id, url.data);
  if (cached?.extracted) return rowToResult(cached);

  // Policy (R4).
  if (await importBlocked(supabase, user.id)) return failed("plan_restricted");

  const sourceKind: RecipeImportSourceType = classifyInstagramUrl(url.data) ?? "website";

  // Claim (W1). Race-loss → return the winner.
  const claim = await claimImport({ userId: user.id, idempotencyKey: key.data, sourceKind, sourceUrl: url.data });
  if (claim.raced) {
    return (await resolveIdempotencyHit(user.id, key.data)) ?? failed("unknown_error");
  }

  return runPipelineFor({ sourceKind, url: url.data, text: null, userId: user.id, importId: claim.importId });
}

// ------------------------------------------------------------------
// submitPasteImport — pasted text (§12)
// ------------------------------------------------------------------

export async function submitPasteImport(_prev: ImportResult | undefined, formData: FormData): Promise<ImportResult> {
  const text = String(formData.get("text") ?? "").trim();
  const key = uuid.safeParse(String(formData.get("idempotencyKey") ?? ""));
  if (!key.success) return failed("invalid_input");
  if (text.length < 20) return failed("invalid_input");

  const user = await currentUser();
  if (!user) return failed("unauthenticated");
  const supabase = await createClient();

  const hit = await resolveIdempotencyHit(user.id, key.data);
  if (hit) return hit;

  if (await importBlocked(supabase, user.id)) return failed("plan_restricted");

  const claim = await claimImport({ userId: user.id, idempotencyKey: key.data, sourceKind: "pasted_text", sourceUrl: null });
  if (claim.raced) {
    return (await resolveIdempotencyHit(user.id, key.data)) ?? failed("unknown_error");
  }

  return runPipelineFor({ sourceKind: "pasted_text", url: null, text, userId: user.id, importId: claim.importId });
}

// ------------------------------------------------------------------
// getImportStatus — poll an in-flight import (R2)
// ------------------------------------------------------------------

export async function getImportStatus(importId: string): Promise<ImportResult> {
  if (!uuid.safeParse(importId).success) return failed("invalid_input");
  const user = await currentUser();
  if (!user) return failed("unauthenticated");

  const row = await readById(user.id, importId);
  if (!row) return failed("invalid_input");
  if (isStale(row)) {
    await failStale(row);
    return failed("unknown_error", row.id);
  }
  return rowToResult(row);
}
