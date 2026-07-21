import { type ImportAiConfig } from "./config";
import { decideEvidence } from "./evidence";
import { pickPrice, unitCostMicroUsd, type PriceRow } from "./pricing";
import type { ResolverChain } from "./registry";
import { backoffMs, classifyProviderError, MAX_TRANSIENT_RETRIES, retrievalFailureRetryable, sleep } from "./retry";
import { aiExtractedRecipeSchema } from "./schema";
import { minimumUsable, normaliseRecipe, qualityScore } from "./validate";
import type {
  AiExtractedRecipe,
  ExtractedRecipe,
  ExtractionWarning,
  ImportFailureReason,
  ImportRequest,
  NormalizedImportInput,
  ProviderUsage,
  RecipeExtractionProvider,
  RetrievalStatus,
  SourceEvidence,
  SourceResolverResult,
} from "./schema";

/**
 * The orchestrator (§5, §19–§22). Runs on an import row already claimed
 * (W1) and in state `created`. Retrieval and AI are separate failure domains
 * (§4.3): a source that could not be retrieved never triggers an AI call. Every
 * paid attempt is written ahead (W3/W4) and costed (§23); every state change is
 * a compare-and-set (W2) so a resumed/duplicated invocation cannot double-spend.
 * Domain failures never throw — they return a classified failure reason.
 */

// ---- store seam: the only surface that touches the database ----

export interface RetrievalAttemptClose {
  status: "succeeded" | "failed" | "unavailable";
  failureReason: ImportFailureReason | null;
  responseStatus: number | null;
  contentType: string | null;
  contentBytes: number | null;
  captionRetrieved: boolean;
  mediaCount: number;
  postType: string | null;
  evidenceStatus: RetrievalStatus | null;
  providerRequestId: string | null;
  externalRunId: string | null;
  unitsUsed: number | null;
  unitType: string | null;
  costMicroUsd: number;
  costAccuracy: "metered" | "estimated" | "none";
  rawUsage: unknown;
  latencyMs: number;
}

export interface AiAttemptClose {
  status: "succeeded" | "failed";
  failureReason: ImportFailureReason | null;
  finishReason: string | null;
  providerRequestId: string | null;
  modelVersion: string | null;
  usage: ProviderUsage;
  inputCostMicroUsd: number;
  outputCostMicroUsd: number;
  totalCostMicroUsd: number;
  costAccuracy: "metered" | "estimated" | "none";
  errorCode: string | null;
  errorMessageSafe: string | null;
  latencyMs: number;
}

export interface ImportStore {
  /** R6 — all current price rows; the engine picks per (provider, service, model, unit). */
  prices: PriceRow[];
  /** W3 insert 'started' → attempt id. */
  openRetrievalAttempt(input: {
    importId: string; userId: string; attemptNumber: number;
    resolverId: string; providerId: string | null; serviceId: string | null;
    status?: "started" | "unavailable";
  }): Promise<string>;
  closeRetrievalAttempt(attemptId: string, patch: RetrievalAttemptClose): Promise<void>;
  /** W4 insert → attempt id. */
  openAiAttempt(input: {
    importId: string; userId: string; attemptNumber: number;
    purpose: "initial" | "retry" | "correction";
    providerId: string; modelId: string; requestModality: string;
  }): Promise<string>;
  closeAiAttempt(attemptId: string, patch: AiAttemptClose): Promise<void>;
  /** W2 compare-and-set. Returns false if another invocation owns the row. */
  transition(input: {
    importId: string; expected: string; next: string;
    failureReason?: ImportFailureReason | null;
    qualityScore?: number | null;
    evidence?: SourceEvidence | null;
    extracted?: ExtractedRecipe | null;
    acceptedResolverId?: string | null;
    costDeltaMicroUsd?: number;
  }): Promise<boolean>;
}

export interface EngineDeps {
  config: ImportAiConfig;
  chain: ResolverChain;
  provider: RecipeExtractionProvider;
  /** Optional fallback provider (§16): tried once if the primary fails terminally. */
  replacementProvider?: RecipeExtractionProvider | null;
  store: ImportStore;
  now?: () => number;
  sleepImpl?: (ms: number) => Promise<void>;
  rand?: () => number;
}

export type EngineOutcome =
  | { kind: "ready"; recipe: ExtractedRecipe; qualityScore: number; warnings: ExtractionWarning[] }
  | { kind: "failed"; failureReason: ImportFailureReason };

// ---- cost helpers (pure) ----

export function retrievalCost(prices: PriceRow[], result: SourceResolverResult): {
  units: number | null; unitType: string | null; costMicroUsd: number; accuracy: "metered" | "estimated" | "none";
} {
  const cost = result.cost;
  if (!cost) {
    // Direct retrieval: execution counts and latency still tracked (§23), zero third-party cost.
    return { units: 1, unitType: "request", costMicroUsd: 0, accuracy: "metered" };
  }
  // Token-priced retrieval (Gemini URL-context): input + tool-use tokens at the
  // input rate, candidates at the output rate, both by the resolver's model.
  // A single-unitType lookup would charge output at the input price and never
  // bill the tokens the URL-context tool fetched.
  if (cost.tokens) {
    let micro = 0;
    let anyUnits = false;
    let anyPriced = false;
    let anyCapped = false;
    const add = (units: number, unitType: string) => {
      if (units <= 0) return;
      anyUnits = true;
      const price = pickPrice(prices, cost.providerId, cost.serviceId, cost.modelId ?? null, unitType);
      if (!price) return;
      anyPriced = true;
      const { costMicroUsd, capped } = unitCostMicroUsd(units, price.price_per_unit_nano_usd);
      micro += costMicroUsd;
      anyCapped ||= capped;
    };
    add(cost.tokens.inputTokens + cost.tokens.toolUseTokens, "input_token");
    add(cost.tokens.outputTokens, "output_token");
    const accuracy = !anyUnits ? "none" : anyPriced ? (anyCapped ? "estimated" : "metered") : "none";
    return { units: cost.unitsUsed, unitType: cost.unitType, costMicroUsd: micro, accuracy };
  }
  const price = pickPrice(prices, cost.providerId, cost.serviceId, cost.modelId ?? null, cost.unitType);
  if (!price) return { units: cost.unitsUsed, unitType: cost.unitType, costMicroUsd: 0, accuracy: "none" };
  const { costMicroUsd, capped } = unitCostMicroUsd(cost.unitsUsed, price.price_per_unit_nano_usd);
  return { units: cost.unitsUsed, unitType: cost.unitType, costMicroUsd, accuracy: capped ? "estimated" : "metered" };
}

interface AiCost {
  inputMicroUsd: number; outputMicroUsd: number; totalMicroUsd: number; accuracy: "metered" | "estimated" | "none";
}

/** Sum per-modality input tokens + output tokens into micro-USD via the price book. */
export function aiCost(prices: PriceRow[], providerId: string, serviceId: string, modelId: string, usage: ProviderUsage): AiCost {
  const components: Array<[number | null, string]> = [
    [usage.inputTextTokens, "input_token"],
    [usage.inputImageTokens, "image_input_token"],
    [usage.inputVideoTokens, "video_input_token"],
    [usage.inputAudioTokens, "audio_input_token"],
    [usage.cachedInputTokens, "cached_input_token"],
    [usage.cacheCreationInputTokens, "cache_creation_input_token"],
  ];
  let input = 0;
  let anyPriced = false;
  let anyCapped = false;
  let anyUnits = false;
  for (const [units, unitType] of components) {
    if (units == null || units === 0) continue;
    anyUnits = true;
    const price = pickPrice(prices, providerId, serviceId, modelId, unitType);
    if (!price) continue;
    anyPriced = true;
    const { costMicroUsd, capped } = unitCostMicroUsd(units, price.price_per_unit_nano_usd);
    input += costMicroUsd;
    anyCapped ||= capped;
  }
  let output = 0;
  const outUnits = usage.outputTokensTotal;
  if (outUnits != null && outUnits > 0) {
    anyUnits = true;
    const price = pickPrice(prices, providerId, serviceId, modelId, "output_token");
    if (price) {
      anyPriced = true;
      const { costMicroUsd, capped } = unitCostMicroUsd(outUnits, price.price_per_unit_nano_usd);
      output += costMicroUsd;
      anyCapped ||= capped;
    }
  }
  const accuracy = !anyUnits ? "none" : anyPriced ? (anyCapped ? "estimated" : "metered") : "none";
  return { inputMicroUsd: input, outputMicroUsd: output, totalMicroUsd: input + output, accuracy };
}

// ---- the pipeline ----

export async function runImportPipeline(request: ImportRequest, deps: EngineDeps): Promise<EngineOutcome> {
  const now = deps.now ?? Date.now;
  const doSleep = deps.sleepImpl ?? sleep;
  const rand = deps.rand ?? Math.random;
  const { store, chain, provider } = deps;

  let retrievalN = 0;
  let aiN = 0;
  let costAccum = 0;

  const fail = async (
    from: string,
    reason: ImportFailureReason,
    costDeltaMicroUsd = 0,
  ): Promise<EngineOutcome> => {
    // Fold any paid-but-failed spend into the import total, so the admin
    // dashboard doesn't report failed imports as free while the attempt ledgers
    // show the cost (§23).
    await store.transition({
      importId: request.importId, expected: from, next: "failed", failureReason: reason, costDeltaMicroUsd,
    });
    return { kind: "failed", failureReason: reason };
  };

  // created → retrieving_source
  if (!(await store.transition({ importId: request.importId, expected: "created", next: "retrieving_source" }))) {
    return { kind: "failed", failureReason: "unknown_error" }; // another invocation owns it
  }

  // Record config-gated rungs as unavailable attempts — never silently absent (W3, AC9).
  for (const gated of chain.gatedOut) {
    const id = await store.openRetrievalAttempt({
      importId: request.importId, userId: request.userId, attemptNumber: ++retrievalN,
      resolverId: gated.resolverId, providerId: gated.providerId, serviceId: gated.serviceId, status: "unavailable",
    });
    await store.closeRetrievalAttempt(id, {
      status: "unavailable", failureReason: null, responseStatus: null, contentType: null, contentBytes: null,
      captionRetrieved: false, mediaCount: 0, postType: null, evidenceStatus: "unavailable",
      providerRequestId: null, externalRunId: null, unitsUsed: 0, unitType: null,
      costMicroUsd: 0, costAccuracy: "none", rawUsage: { gated: gated.reason }, latencyMs: 0,
    });
  }

  if (chain.chain.length === 0) {
    return fail("retrieving_source", "unsupported_source");
  }

  // Resolver chain → evidence gate.
  let acceptedEvidence: SourceEvidence | null = null;
  let acceptedResolverId: string | null = null;
  let deterministic: AiExtractedRecipe | null = null;
  let lastFailure: ImportFailureReason | null = null;

  // Evidence from earlier rungs, carried forward so a later text-only winner
  // (e.g. URL context supplying the full caption) does not lose the cover/creator
  // a partial direct fetch already found (§8).
  const priorEvidence: SourceEvidence[] = [];

  for (const resolver of chain.chain) {
    let result: SourceResolverResult | null = null;
    let attempt = 1;
    // Write-ahead ledger: the 'started' attempt row is inserted BEFORE each
    // physical (possibly paid) resolver call, and every transient retry is its
    // own ledgered attempt — so a crash mid-call still leaves a record and no
    // paid retry is invisible to usage accounting.
    for (;;) {
      const started = now();
      const id = await store.openRetrievalAttempt({
        importId: request.importId, userId: request.userId, attemptNumber: ++retrievalN,
        resolverId: resolver.resolverId, providerId: resolver.providerId, serviceId: resolver.serviceId,
      });
      result = await resolver.resolve(request, { previousEvidence: priorEvidence, fetchImpl: undefined });
      const cost = retrievalCost(store.prices, result);
      costAccum += cost.costMicroUsd;
      await store.closeRetrievalAttempt(id, retrievalClose(result, cost, now() - started));

      if (result.failure && retrievalFailureRetryable(result.failure) && attempt <= MAX_TRANSIENT_RETRIES) {
        await doSleep(backoffMs(attempt, rand));
        attempt++;
        continue;
      }
      break;
    }

    const ev = result.evidence;
    priorEvidence.push(ev);

    // Deterministic zero-AI path (website JSON-LD, AC1).
    if (result.deterministicRecipe && minimumUsable(result.deterministicRecipe)) {
      acceptedEvidence = ev;
      acceptedResolverId = resolver.resolverId;
      deterministic = result.deterministicRecipe;
      break;
    }

    const decision = decideEvidence(ev);
    if (decision.sufficient) {
      acceptedEvidence = ev;
      acceptedResolverId = resolver.resolverId;
      break;
    }
    // Remember why this rung fell short, for the terminal message if the chain runs out.
    lastFailure = result.failure ?? evidenceToFailure(ev, decision.reason);
    // Private/deleted/restricted content is terminal for every remaining rung —
    // stop rather than spend on paid fallbacks (URL context, Apify) that will
    // fail for the same reason the free direct fetch already established.
    if (isTerminalContentFailure(ev)) break;
  }

  if (!acceptedEvidence) {
    return fail("retrieving_source", lastFailure ?? "source_retrieval_failed", costAccum);
  }

  // Backfill cover/creator the accepted (often text-only) winner lacks from an
  // earlier rung, so the review keeps its thumbnail and cover enrichment can run.
  if (!acceptedEvidence.media.some((m) => m.modality === "image")) {
    const priorImage = priorEvidence.flatMap((e) => e.media).find((m) => m.modality === "image");
    if (priorImage) acceptedEvidence = { ...acceptedEvidence, media: [...acceptedEvidence.media, priorImage] };
  }
  if (!acceptedEvidence.creatorName) {
    const priorCreator = priorEvidence.map((e) => e.creatorName).find((n): n is string => Boolean(n));
    if (priorCreator) acceptedEvidence = { ...acceptedEvidence, creatorName: priorCreator };
  }

  // Gate on the CAS result: if a concurrent poll marked this import stale/failed,
  // stop here rather than spend paid cover-enrichment/AI attempts against a row
  // that another invocation already finalized.
  if (!(await store.transition({
    importId: request.importId, expected: "retrieving_source", next: "source_retrieved",
    evidence: acceptedEvidence, acceptedResolverId, costDeltaMicroUsd: costAccum,
  }))) {
    return { kind: "failed", failureReason: "unknown_error" };
  }
  costAccum = 0;

  // Reel cover enrichment is DEFERRED off the critical path: the pipeline finishes
  // with the direct (play-button composite) cover so the preview lands sooner, and
  // the review screen swaps in Apify's clean cover afterwards via
  // POST /api/imports/[id]/cover. Single source of that logic is enrich-cover.ts.
  // See docs/spec/defer-cover-enrichment.md.

  // Deterministic recipe → no AI.
  if (deterministic) {
    return finishReady(deterministic, acceptedEvidence, request, "source_retrieved", store, "jsonld", costAccum);
  }

  // AI extraction. Each transition is CAS-gated — a lost race means a concurrent
  // invocation/poll owns the row, so we stop rather than double-spend.
  if (!(await store.transition({ importId: request.importId, expected: "source_retrieved", next: "queued_for_ai" }))) {
    return { kind: "failed", failureReason: "unknown_error" };
  }
  if (!(await store.transition({ importId: request.importId, expected: "queued_for_ai", next: "ai_processing" }))) {
    return { kind: "failed", failureReason: "unknown_error" };
  }

  const input: NormalizedImportInput = {
    sourceType: acceptedEvidence.sourceType,
    modality: "text",
    text: acceptedEvidence.caption ?? "",
    sourceUrl: acceptedEvidence.sourceUrl ?? undefined,
    sourceTitle: acceptedEvidence.title ?? undefined,
    creatorName: acceptedEvidence.creatorName ?? undefined,
    evidenceWarnings: acceptedEvidence.evidenceWarnings,
  };

  if (!provider.supports(input)) {
    return fail("ai_processing", "ai_provider_error", costAccum);
  }

  let extraction = await runExtractionWithRetry(provider, input, request, deps, () => ++aiN, doSleep, rand);
  costAccum += extraction.costMicroUsd; // keep any cover-enrichment cost + this spend
  // Provider fallback (§16): on a terminal primary failure, retry once against the
  // configured replacement provider before giving up. Its cost is metered too.
  if (extraction.outcome.kind === "failed" && deps.replacementProvider?.supports(input)) {
    const fallback = await runExtractionWithRetry(deps.replacementProvider, input, request, deps, () => ++aiN, doSleep, rand);
    costAccum += fallback.costMicroUsd;
    extraction = fallback;
  }
  if (extraction.outcome.kind === "failed") {
    // A terminal AI failure can still have made paid requests (schema-correction
    // exhaustion, safety/not-recipe after a response) — record that spend.
    return fail("ai_processing", extraction.outcome.failureReason, costAccum);
  }

  if (!(await store.transition({ importId: request.importId, expected: "ai_processing", next: "validating", costDeltaMicroUsd: costAccum }))) {
    return { kind: "failed", failureReason: "unknown_error" };
  }
  costAccum = 0;
  return finishReady(extraction.outcome.recipe, acceptedEvidence, request, "validating", store, acceptedResolverId ?? "ai", costAccum);
}

// ---- retrieval attempt helpers ----

/** Build the ledger close-patch for one physical resolver call. */
function retrievalClose(
  result: SourceResolverResult,
  cost: { units: number | null; unitType: string | null; costMicroUsd: number; accuracy: "metered" | "estimated" | "none" },
  latencyMs: number,
): RetrievalAttemptClose {
  const ev = result.evidence;
  return {
    status: result.failure ? "failed" : ev.retrievalStatus === "unavailable" ? "unavailable" : "succeeded",
    failureReason: result.failure ?? null,
    responseStatus: result.responseStatus ?? null,
    contentType: result.contentType ?? null,
    contentBytes: result.contentBytes ?? null,
    captionRetrieved: Boolean(ev.caption),
    mediaCount: ev.media.length,
    postType: ev.postType ?? null,
    evidenceStatus: ev.retrievalStatus,
    providerRequestId: null,
    externalRunId: result.externalRunId ?? null,
    unitsUsed: cost.units,
    unitType: cost.unitType,
    costMicroUsd: cost.costMicroUsd,
    costAccuracy: cost.accuracy,
    rawUsage: result.cost?.rawUsage ?? null,
    latencyMs: Math.max(0, latencyMs),
  };
}

/** Content that no later rung can recover (unlike a login wall, which a paid
 *  rung might bypass) — so the chain should stop rather than pay to re-confirm. */
function isTerminalContentFailure(ev: SourceEvidence): boolean {
  return ev.evidenceWarnings.some(
    (w) => w === "private_content" || w === "deleted_content" || w === "restricted_content",
  );
}

// ---- AI extraction retry / correction (§20) ----

interface ExtractionRun {
  outcome: { kind: "ok"; recipe: AiExtractedRecipe } | { kind: "failed"; failureReason: ImportFailureReason };
  costMicroUsd: number;
}

async function runExtractionWithRetry(
  provider: RecipeExtractionProvider, input: NormalizedImportInput, request: ImportRequest, deps: EngineDeps,
  nextN: () => number, doSleep: (ms: number) => Promise<void>, rand: () => number,
): Promise<ExtractionRun> {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  let costMicroUsd = 0;
  let correctionErrors: string[] | undefined;
  let transientAttempts = 0;
  let correctionUsed = false;

  for (;;) {
    const purpose: "initial" | "retry" | "correction" = correctionErrors
      ? "correction"
      : transientAttempts > 0
        ? "retry"
        : "initial";
    const attemptId = await store.openAiAttempt({
      importId: request.importId, userId: request.userId, attemptNumber: nextN(), purpose,
      providerId: provider.providerId, modelId: provider.modelId, requestModality: input.modality,
    });

    const started = now();
    const result = await provider.extract(input, { correctionErrors });
    const cost = aiCost(store.prices, provider.providerId, provider.serviceId, provider.modelId, result.usage);
    costMicroUsd += cost.totalMicroUsd;

    if (result.ok) {
      const parsed = aiExtractedRecipeSchema.safeParse(result.recipe);
      if (!parsed.success) {
        await store.closeAiAttempt(attemptId, aiClose("failed", "ai_output_invalid", result, cost, now() - started, "schema_invalid"));
        if (!correctionUsed) {
          correctionUsed = true;
          correctionErrors = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`);
          continue;
        }
        return { outcome: { kind: "failed", failureReason: "ai_output_invalid" }, costMicroUsd };
      }
      await store.closeAiAttempt(attemptId, aiClose("succeeded", null, result, cost, now() - started, null));
      const normalised = normaliseRecipe(parsed.data);
      if (normalised.extractionStatus === "not_recipe") {
        return { outcome: { kind: "failed", failureReason: "not_a_recipe" }, costMicroUsd };
      }
      if (normalised.extractionStatus === "insufficient_content") {
        return { outcome: { kind: "failed", failureReason: "insufficient_content" }, costMicroUsd };
      }
      if (!minimumUsable(normalised)) {
        return { outcome: { kind: "failed", failureReason: "validation_failed" }, costMicroUsd };
      }
      return { outcome: { kind: "ok", recipe: normalised }, costMicroUsd };
    }

    // Provider error.
    const errClass = classifyProviderError(result.errorCode ?? "provider_error");
    const failureReason = providerErrorToFailure(result.errorCode);
    await store.closeAiAttempt(attemptId, aiClose("failed", failureReason, result, cost, now() - started, result.errorCode ?? null));

    if (errClass === "retry" && transientAttempts < MAX_TRANSIENT_RETRIES) {
      transientAttempts++;
      await doSleep(backoffMs(transientAttempts, rand));
      continue;
    }
    if (errClass === "correct_once" && !correctionUsed) {
      correctionUsed = true;
      correctionErrors = [result.errorMessageSafe ?? "invalid structured output"];
      continue;
    }
    return { outcome: { kind: "failed", failureReason }, costMicroUsd };
  }
}

// ---- small pure helpers ----

function aiClose(
  status: "succeeded" | "failed", failureReason: ImportFailureReason | null,
  result: { finishReason?: string | null; providerRequestId?: string | null; modelVersion?: string | null; usage: ProviderUsage; errorMessageSafe?: string },
  cost: AiCost, latencyMs: number, errorCode: string | null,
): AiAttemptClose {
  return {
    status, failureReason,
    finishReason: result.finishReason ?? null,
    providerRequestId: result.providerRequestId ?? null,
    modelVersion: result.modelVersion ?? null,
    usage: result.usage,
    inputCostMicroUsd: cost.inputMicroUsd,
    outputCostMicroUsd: cost.outputMicroUsd,
    totalCostMicroUsd: cost.totalMicroUsd,
    costAccuracy: cost.accuracy,
    errorCode,
    errorMessageSafe: result.errorMessageSafe ?? null,
    latencyMs: Math.max(0, latencyMs),
  };
}

async function finishReady(
  recipe: AiExtractedRecipe, evidence: SourceEvidence, request: ImportRequest,
  fromState: string, store: ImportStore, retrievalMethod: string,
  costDeltaMicroUsd = 0,
): Promise<EngineOutcome> {
  const full: ExtractedRecipe = {
    ...recipe,
    source: {
      sourceType: evidence.sourceType,
      sourceUrl: evidence.sourceUrl,
      sourceTitle: evidence.title,
      creatorName: evidence.creatorName,
      retrievalMethod,
      coverImageUrl: evidence.media.find((m) => m.modality === "image")?.sourceUrl ?? null,
    },
  };
  const score = qualityScore(recipe);
  const ok = await store.transition({
    importId: request.importId, expected: fromState, next: "ready_for_review",
    qualityScore: score, extracted: full, costDeltaMicroUsd,
  });
  if (!ok) return { kind: "failed", failureReason: "unknown_error" };
  return { kind: "ready", recipe: full, qualityScore: score, warnings: recipe.warnings };
}

/** When a rung falls short and the chain is exhausted, translate the evidence gate reason. */
export function evidenceToFailure(evidence: SourceEvidence, reason: string): ImportFailureReason {
  if (evidence.evidenceWarnings.includes("login_wall_detected")) return "login_wall_detected";
  if (evidence.evidenceWarnings.includes("private_content")) return "private_content";
  if (evidence.evidenceWarnings.includes("deleted_content")) return "deleted_content";
  if (reason === "insufficient_caption") return "insufficient_content";
  if (reason === "missing_carousel_items") return "source_incomplete";
  if (reason === "missing_video") return "insufficient_content";
  if (reason === "unavailable") return "source_retrieval_failed";
  return "source_retrieval_failed";
}

export function providerErrorToFailure(code: string | undefined): ImportFailureReason {
  switch (code) {
    case "rate_limited": return "ai_rate_limited";
    case "safety_block": return "ai_safety_block";
    case "schema_invalid": return "ai_output_invalid";
    // A rejected request produced no usable draft — surface that honestly with a
    // paste/manual fallback, not the transient "service is busy" of ai_provider_error.
    case "bad_request": return "ai_output_invalid";
    case "invalid_credentials": return "ai_provider_error";
    case "unsupported": return "ai_provider_error";
    case "timeout":
    case "connection_failed":
    case "provider_error":
    default:
      return "ai_provider_error";
  }
}
