import { createServiceClient } from "@/lib/supabase/server";
import { importConfig } from "./config";
import type { AiAttemptClose, ImportStore, RetrievalAttemptClose } from "./engine";
import type { PriceRow } from "./pricing";
import type {
  ExtractedRecipe,
  ImportFailureReason,
  ImportState,
  RecipeImportSourceType,
  SourceEvidence,
} from "./schema";

/**
 * The only module that touches the import-v2 tables. The ledger tables and the
 * `recipe_imports` v2 columns are not in the generated `Database` types, so the
 * service-role client is cast to a permissive shape **here and nowhere else** —
 * every value crossing back out is re-typed. Service-role bypasses RLS by
 * design (ADR-8: v2 writes never go through the client); every query still
 * filters by `user_id` explicitly.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawClient = any;
function svc(): RawClient {
  return createServiceClient() as unknown as RawClient;
}

const STALE_MS = 10 * 60 * 1000; // R7

const TERMINAL: ReadonlySet<ImportState> = new Set(["ready_for_review", "saved", "failed", "cancelled"]);

export interface ImportRow {
  id: string;
  user_id: string;
  state: ImportState | null;
  failure_reason: ImportFailureReason | null;
  source_url: string | null;
  source_kind: RecipeImportSourceType | null;
  extracted: ExtractedRecipe | null;
  evidence: SourceEvidence | null;
  quality_score: number | null;
  total_cost_micro_usd: number;
  updated_at: string;
  created_at: string;
}

const ROW_COLUMNS =
  "id, user_id, state, failure_reason, source_url, source_kind, extracted, evidence, quality_score, total_cost_micro_usd, updated_at, created_at";

// ------------------------------------------------------------------
// R6 — load the current price book once per import.
// ------------------------------------------------------------------

export async function loadPrices(): Promise<PriceRow[]> {
  const { data } = await svc()
    .from("external_service_pricing")
    .select("provider_id, service_id, model_id, unit_type, price_per_unit_nano_usd")
    .is("effective_to", null);
  return (data ?? []).map((r: PriceRow) => ({
    provider_id: r.provider_id,
    service_id: r.service_id,
    model_id: r.model_id,
    unit_type: r.unit_type,
    price_per_unit_nano_usd: Number(r.price_per_unit_nano_usd),
  }));
}

// ------------------------------------------------------------------
// W1 — claim an import (idempotency lock). Race-loss surfaces via the
// unique (user_id, idempotency_key) index; we read the winner (R1).
// ------------------------------------------------------------------

export async function claimImport(input: {
  userId: string;
  idempotencyKey: string;
  sourceKind: RecipeImportSourceType;
  sourceUrl: string | null;
}): Promise<{ importId: string; raced: false } | { importId: null; raced: true }> {
  const { data, error } = await svc()
    .from("recipe_imports")
    .insert({
      user_id: input.userId,
      idempotency_key: input.idempotencyKey,
      source_kind: input.sourceKind,
      source_url: input.sourceUrl,
      source_type: input.sourceKind.startsWith("instagram") ? "instagram" : input.sourceKind === "website" ? "website" : "manual",
      status: "no_recipe", // legacy NOT NULL column; the v2 truth is `state`
      state: "created",
      schema_version: 2,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation → a concurrent submission won the race.
    if ((error as { code?: string }).code === "23505") return { importId: null, raced: true };
    throw error;
  }
  return { importId: (data as { id: string }).id, raced: false };
}

// ------------------------------------------------------------------
// R1/R2/R3 reads (service client, always user-scoped).
// ------------------------------------------------------------------

export async function readByIdempotencyKey(userId: string, key: string): Promise<ImportRow | null> {
  const { data } = await svc()
    .from("recipe_imports")
    .select(ROW_COLUMNS)
    .eq("user_id", userId)
    .eq("idempotency_key", key)
    .maybeSingle();
  return (data as ImportRow) ?? null;
}

export async function readById(userId: string, importId: string): Promise<ImportRow | null> {
  const { data } = await svc()
    .from("recipe_imports")
    .select(ROW_COLUMNS)
    .eq("user_id", userId)
    .eq("id", importId)
    .maybeSingle();
  return (data as ImportRow) ?? null;
}

export async function readCachedByUrl(userId: string, url: string): Promise<ImportRow | null> {
  const { data } = await svc()
    .from("recipe_imports")
    .select(ROW_COLUMNS)
    .eq("user_id", userId)
    .eq("source_url", url)
    .in("state", ["ready_for_review", "saved"])
    .not("extracted", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ImportRow) ?? null;
}

/**
 * R7 — an import stuck in a non-terminal state past the stale window means the
 * serverless invocation died. Fail it lazily on read so the caller reports a
 * terminal outcome instead of a permanent "processing".
 */
export function isStale(row: ImportRow): boolean {
  if (row.state === null || TERMINAL.has(row.state)) return false;
  return Date.now() - new Date(row.updated_at).getTime() > STALE_MS;
}

export async function failStale(row: ImportRow): Promise<void> {
  await svc().rpc("import_transition", {
    p_id: row.id,
    p_expected: row.state,
    p_next: "failed",
    p_failure_reason: "unknown_error",
  });
}

// ------------------------------------------------------------------
// The engine store seam (W2/W3/W4) bound to a service client + user.
// ------------------------------------------------------------------

export function createImportStore(prices: PriceRow[]): ImportStore {
  const db = svc();
  return {
    prices,

    async openRetrievalAttempt(input) {
      const { data, error } = await db
        .from("source_retrieval_attempts")
        .insert({
          recipe_import_id: input.importId,
          user_id: input.userId,
          attempt_number: input.attemptNumber,
          resolver_id: input.resolverId,
          provider_id: input.providerId,
          service_id: input.serviceId,
          status: input.status ?? "started",
        })
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },

    async closeRetrievalAttempt(attemptId, patch: RetrievalAttemptClose) {
      await db
        .from("source_retrieval_attempts")
        .update({
          status: patch.status,
          failure_reason: patch.failureReason,
          response_status: patch.responseStatus,
          content_type: patch.contentType,
          content_bytes: patch.contentBytes,
          caption_retrieved: patch.captionRetrieved,
          media_count: patch.mediaCount,
          post_type: patch.postType,
          evidence_status: patch.evidenceStatus,
          provider_request_id: patch.providerRequestId,
          external_run_id: patch.externalRunId,
          units_used: patch.unitsUsed,
          unit_type: patch.unitType,
          cost_micro_usd: patch.costMicroUsd,
          cost_accuracy: patch.costAccuracy,
          raw_usage_json: patch.rawUsage ?? null,
          latency_ms: patch.latencyMs,
          completed_at: new Date().toISOString(),
        })
        .eq("id", attemptId);
    },

    async openAiAttempt(input) {
      const { data, error } = await db
        .from("ai_extraction_attempts")
        .insert({
          recipe_import_id: input.importId,
          user_id: input.userId,
          attempt_number: input.attemptNumber,
          purpose: input.purpose,
          provider_id: input.providerId,
          model_id: input.modelId,
          request_modality: input.requestModality,
          status: "started",
        })
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },

    async closeAiAttempt(attemptId, patch: AiAttemptClose) {
      const u = patch.usage;
      await db
        .from("ai_extraction_attempts")
        .update({
          status: patch.status,
          failure_reason: patch.failureReason,
          finish_reason: patch.finishReason,
          provider_request_id: patch.providerRequestId,
          model_version: patch.modelVersion,
          input_text_tokens: u.inputTextTokens,
          input_image_tokens: u.inputImageTokens,
          input_video_tokens: u.inputVideoTokens,
          input_audio_tokens: u.inputAudioTokens,
          tool_use_input_tokens: u.toolUseInputTokens,
          cached_input_tokens: u.cachedInputTokens,
          output_candidate_tokens: u.outputCandidateTokens,
          output_thinking_tokens: u.outputThinkingTokens,
          output_tokens_total: u.outputTokensTotal,
          input_cost_micro_usd: patch.inputCostMicroUsd,
          output_cost_micro_usd: patch.outputCostMicroUsd,
          total_cost_micro_usd: patch.totalCostMicroUsd,
          cost_accuracy: patch.costAccuracy,
          error_code: patch.errorCode,
          error_message_safe: patch.errorMessageSafe,
          raw_usage_json: u.raw ?? null,
          latency_ms: patch.latencyMs,
          completed_at: new Date().toISOString(),
        })
        .eq("id", attemptId);
    },

    async transition(input) {
      const { data, error } = await db.rpc("import_transition", {
        p_id: input.importId,
        p_expected: input.expected,
        p_next: input.next,
        p_failure_reason: input.failureReason ?? null,
        p_quality_score: input.qualityScore ?? null,
        p_evidence: input.evidence ?? null,
        p_extracted: input.extracted ?? null,
        p_accepted_resolver_id: input.acceptedResolverId ?? null,
        p_cost_delta: input.costDeltaMicroUsd ?? 0,
      });
      if (error) throw error;
      return data === true;
    },
  };
}

/**
 * Link a confirmed import to the recipe it became and move it `ready_for_review`
 * → `saved` (the import→recipe audit trail). Best-effort and idempotent: the
 * `state` guard acts as a CAS so it can't clobber a failed/cancelled row, and it
 * filters by `user_id`. A failure here never blocks the recipe save.
 */
export async function markImportSaved(importId: string, recipeId: string, userId: string): Promise<void> {
  await svc()
    .from("recipe_imports")
    .update({ state: "saved", recipe_id: recipeId })
    .eq("id", importId)
    .eq("user_id", userId)
    .eq("state", "ready_for_review");
}

export const config = importConfig;
