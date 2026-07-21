import { z } from "zod";

/**
 * The single home for every import-v2 domain type (spec §6–§10, §15, §18, §21;
 * architecture schema.md "Types have one home"). Every consumer — actions,
 * resolvers, providers, validation, engine, tests — imports from here; none
 * redefines. The Postgres enums and CHECK vocabularies mirror these lists.
 */

// ------------------------------------------------------------------
// §6 — source types
// ------------------------------------------------------------------

export const SOURCE_KINDS = [
  "pasted_text",
  "website",
  "instagram_post",
  "instagram_carousel",
  "instagram_reel",
  "screenshot",
  "uploaded_image",
  "uploaded_video",
] as const;
export const sourceKindSchema = z.enum(SOURCE_KINDS);
export type RecipeImportSourceType = z.infer<typeof sourceKindSchema>;

export const importModalitySchema = z.enum(["text", "image", "video", "audio", "mixed"]);
export type ImportModality = z.infer<typeof importModalitySchema>;

// ------------------------------------------------------------------
// §21 — state machine + failure reasons (mirrors the Postgres enums)
// ------------------------------------------------------------------

export const IMPORT_STATES = [
  "created",
  "policy_checked",
  "retrieving_source",
  "source_partially_retrieved",
  "source_retrieved",
  "parsing_source",
  "ai_not_required",
  "queued_for_ai",
  "ai_processing",
  "validating",
  "ready_for_review",
  "saved",
  "failed",
  "cancelled",
] as const;
export const importStateSchema = z.enum(IMPORT_STATES);
export type ImportState = z.infer<typeof importStateSchema>;

/** States from which no further work may happen. */
export const TERMINAL_STATES: readonly ImportState[] = ["ready_for_review", "saved", "failed", "cancelled"];

export const IMPORT_FAILURE_REASONS = [
  "unauthenticated",
  "plan_restricted",
  "invalid_input",
  "unsupported_source",
  "source_retrieval_failed",
  "source_incomplete",
  "source_too_large",
  "source_timeout",
  "login_wall_detected",
  "private_content",
  "deleted_content",
  "not_a_recipe",
  "insufficient_content",
  "ai_rate_limited",
  "ai_provider_error",
  "ai_safety_block",
  "ai_output_invalid",
  "validation_failed",
  "temporary_media_cleanup_failed",
  "unknown_error",
] as const;
export const importFailureReasonSchema = z.enum(IMPORT_FAILURE_REASONS);
export type ImportFailureReason = z.infer<typeof importFailureReasonSchema>;

// ------------------------------------------------------------------
// §7 — source evidence model
// ------------------------------------------------------------------

export const SOURCE_EVIDENCE_WARNINGS = [
  "caption_missing",
  "caption_may_be_truncated",
  "carousel_items_missing",
  "video_unavailable",
  "audio_unavailable",
  "login_wall_detected",
  "private_content",
  "deleted_content",
  "restricted_content",
  "nested_media_not_retrieved",
  "source_format_changed",
  "unknown_completeness",
] as const;
export const sourceEvidenceWarningSchema = z.enum(SOURCE_EVIDENCE_WARNINGS);
export type SourceEvidenceWarning = z.infer<typeof sourceEvidenceWarningSchema>;

export const retrievalStatusSchema = z.enum(["complete", "partial", "unavailable", "unsupported"]);
export type RetrievalStatus = z.infer<typeof retrievalStatusSchema>;

export const postTypeSchema = z.enum(["single_image", "carousel", "reel", "unknown"]);
export type PostType = z.infer<typeof postTypeSchema>;

export const sourceMediaSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  modality: z.enum(["image", "video", "audio"]),
  mimeType: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  storagePath: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  durationSeconds: z.number().nullable(),
});
export type SourceMedia = z.infer<typeof sourceMediaSchema>;

export const sourceEvidenceSchema = z.object({
  sourceType: sourceKindSchema,
  sourceUrl: z.string().nullable(),
  retrievalStatus: retrievalStatusSchema,
  resolverId: z.string(),
  resolverAttemptId: z.string(),
  postType: postTypeSchema.optional(),
  caption: z.string().nullable(),
  title: z.string().nullable(),
  creatorName: z.string().nullable(),
  media: z.array(sourceMediaSchema),
  evidenceWarnings: z.array(sourceEvidenceWarningSchema),
  contentFingerprint: z.string().nullable(),
  retrievedAt: z.string(),
});
export type SourceEvidence = z.infer<typeof sourceEvidenceSchema>;

// ------------------------------------------------------------------
// §10 — evidence acceptance gate
// ------------------------------------------------------------------

export const evidenceDecisionSchema = z.object({
  sufficient: z.boolean(),
  reason: z.enum([
    "complete_caption",
    "complete_media",
    "caption_and_media",
    "insufficient_caption",
    "missing_carousel_items",
    "missing_video",
    "login_wall",
    "unknown_completeness",
    "unavailable",
  ]),
  nextAction: z.enum(["extract_recipe", "try_next_resolver", "request_user_input"]),
});
export type EvidenceDecision = z.infer<typeof evidenceDecisionSchema>;

// ------------------------------------------------------------------
// §18 — structured recipe schema (v2 ExtractedRecipe)
// ------------------------------------------------------------------

/**
 * §18 references ExtractionWarning without enumerating members; kept open as
 * {code, message} so provider warnings survive verbatim (recorded as a
 * deliberate open type in the story's build notes).
 */
export const extractionWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type ExtractionWarning = z.infer<typeof extractionWarningSchema>;

export const extractedIngredientSchema = z.object({
  temporaryId: z.string(),
  position: z.number().int(),
  originalText: z.string(),
  quantityText: z.string().nullable(),
  quantityValue: z.number().nullable(),
  quantityMin: z.number().nullable(),
  quantityMax: z.number().nullable(),
  unit: z.string().nullable(),
  name: z.string(),
  preparation: z.string().nullable(),
  optional: z.boolean(),
  alternativeGroupId: z.string().nullable(),
});
export type ExtractedIngredient = z.infer<typeof extractedIngredientSchema>;

export const extractedIngredientGroupSchema = z.object({
  temporaryId: z.string(),
  name: z.string().nullable(),
  position: z.number().int(),
  optional: z.boolean(),
  ingredients: z.array(extractedIngredientSchema),
});
export type ExtractedIngredientGroup = z.infer<typeof extractedIngredientGroupSchema>;

export const extractedRecipeStepSchema = z.object({
  position: z.number().int(),
  title: z.string().nullable(),
  instruction: z.string(),
  ingredientGroupReferences: z.array(z.string()),
});
export type ExtractedRecipeStep = z.infer<typeof extractedRecipeStepSchema>;

export const extractionStatusSchema = z.enum(["recipe", "not_recipe", "insufficient_content"]);
export type ExtractionStatus = z.infer<typeof extractionStatusSchema>;

/**
 * Nutrition as stated by the source (§ new — captions/JSON-LD). Verbatim
 * amounts (e.g. "480 kcal", "45g"), never calculated or invented; null per
 * macro when the source omits it. `perServing` records whether the figures are
 * per portion (the common Instagram case) or for the whole recipe.
 */
export const extractedNutritionSchema = z.object({
  calories: z.string().nullable(),
  protein: z.string().nullable(),
  carbs: z.string().nullable(),
  fat: z.string().nullable(),
  fibre: z.string().nullable(),
  sugar: z.string().nullable(),
  perServing: z.boolean().nullable(),
});
export type ExtractedNutrition = z.infer<typeof extractedNutritionSchema>;

export const extractedRecipeSchema = z.object({
  extractionStatus: extractionStatusSchema,
  title: z.string().nullable(),
  description: z.string().nullable(),
  servings: z.object({
    value: z.number().nullable(),
    originalText: z.string().nullable(),
  }),
  nutrition: extractedNutritionSchema.nullable(),
  prepTimeMinutes: z.number().nullable(),
  cookTimeMinutes: z.number().nullable(),
  totalTimeMinutes: z.number().nullable(),
  ingredientGroups: z.array(extractedIngredientGroupSchema),
  steps: z.array(extractedRecipeStepSchema),
  tips: z.array(z.string()),
  servingSuggestions: z.array(z.string()),
  source: z.object({
    sourceType: sourceKindSchema,
    sourceUrl: z.string().nullable(),
    sourceTitle: z.string().nullable(),
    creatorName: z.string().nullable(),
    retrievalMethod: z.string(),
    /** First image from the source (Instagram og:image / website image), for the
     *  cover thumbnail. The engine fills it from evidence; the model never sees it. */
    coverImageUrl: z.string().nullable().default(null),
  }),
  warnings: z.array(extractionWarningSchema),
  missingFields: z.array(z.string()),
});
export type ExtractedRecipe = z.infer<typeof extractedRecipeSchema>;

/**
 * The shape the AI is asked to return: §18 minus `source` (the engine owns
 * source attribution — the model must never invent it).
 */
export const aiExtractedRecipeSchema = extractedRecipeSchema.omit({ source: true });
export type AiExtractedRecipe = z.infer<typeof aiExtractedRecipeSchema>;

// ------------------------------------------------------------------
// §8 / §15 — resolver + provider abstractions (internal contracts)
// ------------------------------------------------------------------

/** What the user submitted, normalised once at the action boundary. */
export interface ImportRequest {
  sourceKind: RecipeImportSourceType;
  url: string | null;
  text: string | null;
  userId: string;
  importId: string;
}

export interface ResolverContext {
  /** Previous rungs' evidence, so a resolver can avoid repeating work (§8). */
  previousEvidence: SourceEvidence[];
  /** Injected fetch seam for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface ExternalServiceCost {
  providerId: string;
  serviceId: string;
  unitsUsed: number;
  unitType: string;
  /** Raw provider usage block (metadata only — never content, §26). */
  rawUsage?: unknown;
  /**
   * Model id for model-specific price rows (e.g. Gemini URL-context). Absent/null
   * means the price lookup falls back to the `*` wildcard row (Apify, direct).
   */
  modelId?: string | null;
  /**
   * Token breakdown for token-priced retrieval (Gemini URL-context is a
   * generateContent call). When present the engine prices input + tool-use tokens
   * at `input_token` and output tokens at `output_token` by model, instead of the
   * single-unitType path — otherwise output tokens are charged at the input rate
   * and the tokens the URL-context tool fetched are not billed at all.
   */
  tokens?: { inputTokens: number; outputTokens: number; toolUseTokens: number } | null;
}

export interface SourceResolverResult {
  evidence: SourceEvidence;
  cost: ExternalServiceCost | null;
  /**
   * A recipe the resolver parsed deterministically, zero-cost (website JSON-LD,
   * §11 / AC1). When present and sufficient, the engine records `ai_not_required`
   * and spends no AI attempt. Absent for every AI-bound path.
   */
  deterministicRecipe?: AiExtractedRecipe | null;
  /** Resolver-internal payload (e.g. raw page HTML for the deterministic parser). */
  rawMetadata?: unknown;
  /** Retrieval telemetry for the attempt ledger. */
  responseStatus?: number | null;
  contentType?: string | null;
  contentBytes?: number | null;
  externalRunId?: string | null;
  /** Set when retrieval failed for a specific, classified reason. */
  failure?: ImportFailureReason | null;
}

export interface SourceResolver {
  readonly resolverId: string;
  /** Provider/service ids for pricing + the attempt ledger; null = direct fetch. */
  readonly providerId: string | null;
  readonly serviceId: string | null;
  supports(request: ImportRequest): boolean;
  resolve(request: ImportRequest, context: ResolverContext): Promise<SourceResolverResult>;
}

export interface NormalizedImportInput {
  sourceType: RecipeImportSourceType;
  modality: ImportModality;
  text?: string;
  media?: Array<{
    id: string;
    position: number;
    mimeType: string;
    storagePath?: string;
    durationSeconds?: number;
  }>;
  sourceUrl?: string;
  sourceTitle?: string;
  creatorName?: string;
  evidenceWarnings: SourceEvidenceWarning[];
}

export interface ProviderUsage {
  inputTextTokens: number | null;
  inputImageTokens: number | null;
  inputVideoTokens: number | null;
  inputAudioTokens: number | null;
  toolUseInputTokens: number | null;
  cachedInputTokens: number | null;
  cacheCreationInputTokens: number | null;
  outputCandidateTokens: number | null;
  outputThinkingTokens: number | null;
  outputTokensTotal: number | null;
  raw: unknown;
}

export type ProviderErrorCode =
  | "timeout"
  | "connection_failed"
  | "rate_limited"
  | "provider_error"
  /** HTTP 400 — the request WE sent was invalid. Permanent; never retried. */
  | "bad_request"
  | "invalid_credentials"
  | "safety_block"
  | "schema_invalid"
  | "unsupported";

export interface ExtractionContext {
  /** Validation errors from a schema-invalid first attempt (§20: one correction). */
  correctionErrors?: string[];
  fetchImpl?: typeof fetch;
}

export interface ProviderExtractionResult {
  ok: boolean;
  /** Raw parsed JSON when ok — validated against aiExtractedRecipeSchema by the engine. */
  recipe?: unknown;
  errorCode?: ProviderErrorCode;
  /** Sanitised; never raw provider payload text (§26). */
  errorMessageSafe?: string;
  finishReason?: string | null;
  providerRequestId?: string | null;
  modelVersion?: string | null;
  usage: ProviderUsage;
}

export interface RecipeExtractionProvider {
  readonly providerId: string;
  readonly serviceId: string;
  readonly modelId: string;
  supports(input: NormalizedImportInput): boolean;
  extract(input: NormalizedImportInput, context: ExtractionContext): Promise<ProviderExtractionResult>;
}

// ------------------------------------------------------------------
// api.md — the one result envelope
// ------------------------------------------------------------------

export type FallbackKind = "paste_caption" | "upload_screenshots" | "add_manually";

export type ImportResult =
  | { phase: "exists"; recipeId: string; title: string; coverUrl: string | null }
  | { phase: "processing"; importId: string; state: ImportState }
  | {
      phase: "ready";
      importId: string;
      recipe: ExtractedRecipe;
      qualityScore: number;
      warnings: ExtractionWarning[];
    }
  | {
      phase: "failed";
      importId: string | null;
      failureReason: ImportFailureReason;
      message: string;
      fallback: FallbackKind[];
    };

export const EMPTY_USAGE: ProviderUsage = {
  inputTextTokens: null,
  inputImageTokens: null,
  inputVideoTokens: null,
  inputAudioTokens: null,
  toolUseInputTokens: null,
  cachedInputTokens: null,
  cacheCreationInputTokens: null,
  outputCandidateTokens: null,
  outputThinkingTokens: null,
  outputTokensTotal: null,
  raw: null,
};
