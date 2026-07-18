---
author: tara
project: recipe
type: spec
created: 2026-07-17
status: validated
links: [user-story/import-engine-v2.md, user-story/import-capture-review-v2.md, user-story/import-admin-usage-v2.md]
---

# Cookdex Recipe Importer & AI Extraction — v2 Specification

Freddi's full specification, adopted 2026-07-17, replaces the v1 importer
(`src/lib/import/`). This file is the single source of truth for the three
stories that implement it. Where the spec below names Gemini, the
implementation reality in §0 governs.

---

## 0. Implementation reality (Tara, 2026-07-17 — read first)

Decisions made against the actual environment, with Freddi's pre-approval
("if we don't have Gemini access, use Claude for the moment"):

1. **No Gemini API key exists in this project's environment** (`.env` /
   `.env.local` carry `ANTHROPIC_API_KEY` and `APIFY_API_TOKEN` only).
   Therefore:
   - `AI_PRIMARY_PROVIDER=anthropic`, `AI_PRIMARY_MODEL=claude-haiku-4-5`
     (the cost-tier equivalent of `gemini-2.5-flash-lite`; already the
     live extraction model). `AI_REPLACEMENT_MODEL` stays configurable.
   - A `GeminiRecipeExtractionProvider` adapter and a
     `GeminiUrlContextInstagramResolver` are implemented to the provider /
     resolver interfaces but **registered only when `GOOGLE_API_KEY` is
     present**. Switching to Gemini is a configuration change plus the §29
     benchmark — no code change outside the adapter, exactly as §3.4
     requires. Without the key, the Instagram resolver chain is
     direct → Apify → user fallback; the URL-context rung is skipped and
     recorded as `unavailable`, never silently pretended.
2. **Claude has no video-input support** (confirmed against current API
   docs 2026-07-17). `uploaded_video` and Reel-video extraction return
   `unsupported` with the honest user fallback of §9.4. The spec permits
   this ("where supported"). The pathway activates when a video-capable
   provider is keyed.
3. **Claude pricing seeds** (current, per MTok): Haiku 4.5 input $1.00,
   output $5.00 → 1 and 5 micro-USD per token. Gemini 2.5 Flash-Lite seeds
   from §16 ($0.10 / $0.30 audio / $0.40) are fractional micro-USD per
   token — the pricing table must store price per unit at a precision that
   holds both (Archie decides the representation; no float money).
4. **Apify token is present** — the Apify rung is live-verifiable in this
   session. The 100-post PoC of §28 requires Freddi to supply real post
   URLs and is **deferred**; per §30 the handover will say
   *"Implemented but Instagram retrieval not fully verified"* until it runs.
5. **Deferred, requiring Freddi:** §28 live PoC, §29 model-migration
   benchmark (needs a second provider keyed), §26 legal review. Everything
   else in the spec is in scope now.
6. Existing v1 assets that survive (extended, not rewritten): SSRF guard
   (`url-guard.ts`), capped safe fetch (`safe-fetch.ts`), JSON-LD parser
   (`jsonld.ts`), Apify abort-on-fail pattern (`apify.ts`), per-user
   import rate limit (`limit.ts`).

---

## 1. Purpose

Build a reliable, high-quality and cost-controlled recipe import system.

Supported sources: pasted recipe text; recipe website URLs; public
Instagram post / carousel / Reel URLs; uploaded screenshots; uploaded
recipe images; uploaded video files where supported.

The importer transforms source content into an editable Cookdex recipe
draft containing: title, description, servings, prep time, cook time,
ingredient groups, structured ingredients, ordered method steps, tips,
serving suggestions, source attribution, and warnings about missing,
conflicting or inaccessible information.

The system must not depend permanently on any one model or provider.

## 2. Main import strategy

Never send every source straight to AI. Cheapest reliable method first:

```
1. Retrieve the source
2. Extract deterministic structured data where possible
3. Decide whether AI is required
4. Use the AI provider only when necessary
5. Validate the result
6. Show an editable preview
7. Save only after user confirmation
```

Instagram resolver chain (in order):

```
1. Direct public-page retrieval
2. Gemini URL Context fallback        (config-gated, see §0.1)
3. Apify fallback
4. User-provided caption, screenshots or manual entry
```

Apify is never the first call. It runs only when cheaper rungs fail to
produce sufficient evidence.

## 3. Platform constraints

- Direct Instagram retrieval is best-effort: a public page may not expose
  the full caption, all carousel slides, or a Reel video URL in one
  server-side HTML request. Treat it as a resolver, not a guarantee.
- Instagram oEmbed and the official Instagram Platform APIs are not
  general extraction APIs; do not build on them for arbitrary URLs.
- Gemini URL Context (when active) supports HTML/JSON/text/images/PDF
  only, does not follow nested links, does not watch video or listen to
  audio, and cannot combine with structured output on 2.5-generation
  models — hence the two-stage flow (§9.2): retrieve evidence first, then
  feed normalised evidence to the structured extractor.
- Model lifecycle: model identifiers live in configuration only
  (`AI_PRIMARY_PROVIDER`, `AI_PRIMARY_MODEL`, `AI_REPLACEMENT_MODEL`).
  No production code outside a provider adapter names a model ID.

## 4. Core principles

1. **AI extracts; it does not invent.** No invented ingredients,
   quantities, measurements, temperatures, times, servings, equipment,
   steps, sections, tips, or attribution. Missing information is `null`,
   an empty list, or a specific warning.
2. **Preserve source meaning**: original ingredient wording, ingredient
   order, group order, method order, quantity ranges, optional
   ingredients/groups, genuine alternatives, creator/source attribution.
3. **Source retrieval and AI extraction are separate failures**:
   `source_retrieval_failed` vs `ai_extraction_failed`. Never call the AI
   repeatedly when the source could not be retrieved.
4. **Validate source evidence before accepting AI output.** Valid JSON
   does not prove the model saw the whole recipe.
5. **Every imported recipe is reviewed.** All imports open in an editable
   preview; nothing is auto-saved to the collection.
6. **All integrations are replaceable.** Providers and resolvers sit
   behind interfaces; UI and database never consume provider-specific
   response formats.

## 5. Architecture layers

```
frontend → import request → auth → policy check → source resolver
→ evidence validation → deterministic parser → AI decision
→ extraction orchestrator → provider registry → provider adapter
→ runtime schema validation → quality checks → editable preview
→ user confirms → save
```

## 6. Source types

```ts
type RecipeImportSourceType =
  | "pasted_text" | "website"
  | "instagram_post" | "instagram_carousel" | "instagram_reel"
  | "screenshot" | "uploaded_image" | "uploaded_video";

type ImportModality = "text" | "image" | "video" | "audio" | "mixed";
```

## 7. Source evidence model

All resolvers produce the same normalised result:

```ts
interface SourceEvidence {
  sourceType: RecipeImportSourceType;
  sourceUrl: string | null;
  retrievalStatus: "complete" | "partial" | "unavailable" | "unsupported";
  resolverId: string;
  resolverAttemptId: string;
  postType?: "single_image" | "carousel" | "reel" | "unknown";
  caption: string | null;
  title: string | null;
  creatorName: string | null;
  media: SourceMedia[];
  evidenceWarnings: SourceEvidenceWarning[];
  contentFingerprint: string | null;
  retrievedAt: string;
}

interface SourceMedia {
  id: string; position: number;
  modality: "image" | "video" | "audio";
  mimeType: string | null; sourceUrl: string | null;
  storagePath: string | null;
  width: number | null; height: number | null;
  durationSeconds: number | null;
}

type SourceEvidenceWarning =
  | "caption_missing" | "caption_may_be_truncated"
  | "carousel_items_missing" | "video_unavailable" | "audio_unavailable"
  | "login_wall_detected" | "private_content" | "deleted_content"
  | "restricted_content" | "nested_media_not_retrieved"
  | "source_format_changed" | "unknown_completeness";
```

## 8. Resolver abstraction

```ts
interface SourceResolver {
  readonly resolverId: string;
  supports(request: ImportRequest): boolean;
  resolve(request: ImportRequest, context: ResolverContext): Promise<SourceResolverResult>;
}
interface SourceResolverResult {
  evidence: SourceEvidence;
  cost: ExternalServiceCost | null;
  rawMetadata?: unknown;
}
```

Each resolver receives the previous attempt's output so it can avoid
repeating work.

## 9. Instagram resolver chain

### 9.1 Direct public-page retrieval (first)

Validate/normalise URL → server-side fetch → inspect status, redirects,
content type → parse via small independent parser modules (Open Graph,
JSON-LD, embedded JSON state, known script-data patterns, fallback
metadata — never one fragile selector) → produce `SourceEvidence`.

Fetcher requirements: server-side only; short timeout; redirect limit;
response-size cap; http(s) only; reject localhost/private IPs; re-validate
redirect destinations; clear Cookdex user agent; no unnecessary cookies;
no authenticated scraping; record status + content type.

Success criteria by post type:
- **Caption-led image post**: caption retrieved, not obviously truncated,
  contains likely ingredient/method information.
- **Carousel**: caption contains the complete recipe, OR all required
  slides retrieved.
- **Reel**: caption alone acceptable only if it appears to contain the
  complete recipe; otherwise a usable video file is needed or the chain
  continues.

Failure → next rung when: page unreachable; login wall; caption missing or
truncated; carousel evidence incomplete; Reel caption insufficient;
required media unidentifiable; page structure unrecognised.

### 9.2 Gemini URL Context (second, config-gated per §0.1)

Two-stage flow only: Stage 1 asks the model to inspect the public page
and return **source evidence only** (visible caption, creator, post type,
whether the full recipe is visible, "recipe in bio" flags, video/audio
dependency) — never to complete the recipe. Stage 2 normalises that into
`SourceEvidence`, recording model, token usage, retrieval status,
warnings, sufficiency. Never assume URL Context followed carousel links,
watched video, heard audio, or bypassed a login wall. Proceed to
extraction only when actual recipe source content came back; generic
"this page is a recipe" descriptions are rejected as evidence.

### 9.3 Apify (third)

Called only when cheaper rungs failed or produced incomplete evidence, or
an explicit retry route selects it. The adapter maps Apify's response to
`SourceEvidence`; nothing outside the adapter touches raw Apify data.
Retain only: caption, creator, post type, carousel children, image URLs,
video URL, duration, alt text, original URL. Do not retrieve or retain
comments, follower counts, likes, profile data, or analytics. On failure:
no endless retries, record separately, offer the user fallback (§9.4).

### 9.4 User-provided fallback (last, most reliable)

"We couldn't read this Instagram post automatically — paste the caption /
upload screenshots / add it manually." For Reels whose recipe is in the
video: "upload screenshots of the ingredients and method / paste the text
/ add manually." Never present retrieval failure as an AI error.

## 10. Evidence acceptance gate

```ts
interface EvidenceDecision {
  sufficient: boolean;
  reason: "complete_caption" | "complete_media" | "caption_and_media"
    | "insufficient_caption" | "missing_carousel_items" | "missing_video"
    | "login_wall" | "unknown_completeness" | "unavailable";
  nextAction: "extract_recipe" | "try_next_resolver" | "request_user_input";
}
```

Minimum evidence: text-led → meaningful source text with ingredient /
quantity / instruction signal, more than a generic food description;
screenshot-led → at least one readable image, order preserved;
carousel-led → full caption or sufficient slides; Reel-led → complete
caption, accessible video, or user-provided material. Never accept a
recipe merely because the model produced a title, two plausible
ingredients and a generic method.

## 11. Website flow

Secure fetch → schema.org Recipe JSON-LD → if valid and sufficiently
complete (non-empty title, ≥1 ingredient, ≥1 usable step, no critical
errors) → **skip AI entirely**. Missing servings/times/description/tips do
not force an AI call. Otherwise isolate useful page content (never ship
raw full HTML) → AI extraction.

## 12. Pasted text flow

Validate (reject empty, clearly unsupported, oversized) → normalise
whitespace → AI extraction → validate → preview. No fragile regex recipe
parser for arbitrary text.

## 13. Screenshot / image flow

Validate type, count, size → preserve order → optimise without damaging
text legibility (no aggressive food-photo compression on text
screenshots) → upload to private temporary storage → one logical
multimodal extraction request for all images of one recipe → validate →
**delete temporary files** → preview.

## 14. Reel / video flow

Caption complete → text-only extraction. Caption incomplete + video
available *and provider supports video* → caption + video extraction.
Neither → request user screenshots/text. Temporary video deleted after
success, failure, cancellation, or expiry; never stored permanently.
(Per §0.2: video extraction is `unsupported` until a video-capable
provider is keyed.)

## 15. Provider abstraction

```ts
interface RecipeExtractionProvider {
  readonly providerId: string;
  readonly modelId: string;
  supports(input: NormalizedImportInput): boolean;
  extract(input: NormalizedImportInput, context: ExtractionContext): Promise<ProviderExtractionResult>;
}

interface NormalizedImportInput {
  sourceType: RecipeImportSourceType;
  modality: ImportModality;
  text?: string;
  media?: Array<{ id: string; position: number; mimeType: string;
                  storagePath?: string; durationSeconds?: number }>;
  sourceUrl?: string; sourceTitle?: string; creatorName?: string;
  evidenceWarnings: SourceEvidenceWarning[];
}
```

Adding a provider requires only: an adapter, provider config, pricing
config, contract tests. It must not touch resolvers, UI, recipe tables,
ingredient tables, or grocery logic.

## 16. Provider configuration

```
AI_PRIMARY_PROVIDER=anthropic          # google when GOOGLE_API_KEY lands
AI_PRIMARY_MODEL=claude-haiku-4-5
AI_REPLACEMENT_MODEL=                  # e.g. gemini-2.5-flash-lite
AI_PROVIDER_FALLBACK_ENABLED=false
```

Pricing is seeded into pricing records, never hardcoded in business
logic. Gemini seeds (per §3 of Freddi's spec): text/image/video input
$0.10/MTok, audio input $0.30/MTok, output $0.40/MTok. Claude seeds per
§0.3. Migration to a new model: run the full benchmark on both models,
compare quality / cost-per-successful-recipe / schema-valid rate /
latency, get Freddi's approval, change configuration, monitor.

## 17. Extraction prompt (system instruction, all providers)

```
You extract recipes from supplied source evidence for Cookdex.
Use only information that appears in the supplied evidence.
Do not invent ingredients, quantities, temperatures, timings, servings,
equipment, headings or instructions.
Use null or an empty collection when information is missing.
Preserve original ingredient wording.
Preserve ingredient section order and ingredient order within sections.
Preserve cooking-step order.
Recognise quantity ranges without selecting one guessed value.
Recognise optional ingredients and optional sections.
Recognise true ingredient alternatives.
Do not treat every use of "or" as an alternative choice.
Do not convert units unless the source includes that conversion.
If the source is not a recipe, return not_recipe.
If the source refers to unavailable recipe content, return insufficient_content.
Report contradictions, missing content and unreadable evidence as warnings.
```

## 18. Structured recipe schema

```ts
interface ExtractedRecipe {
  extractionStatus: "recipe" | "not_recipe" | "insufficient_content";
  title: string | null;
  description: string | null;
  servings: { value: number | null; originalText: string | null };
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  ingredientGroups: ExtractedIngredientGroup[];
  steps: ExtractedRecipeStep[];
  tips: string[];
  servingSuggestions: string[];
  source: { sourceType: RecipeImportSourceType; sourceUrl: string | null;
            sourceTitle: string | null; creatorName: string | null;
            retrievalMethod: string };
  warnings: ExtractionWarning[];
  missingFields: string[];
}

interface ExtractedIngredientGroup {
  temporaryId: string; name: string | null; position: number;
  optional: boolean; ingredients: ExtractedIngredient[];
}

interface ExtractedIngredient {
  temporaryId: string; position: number;
  originalText: string;
  quantityText: string | null; quantityValue: number | null;
  quantityMin: number | null; quantityMax: number | null;
  unit: string | null; name: string; preparation: string | null;
  optional: boolean; alternativeGroupId: string | null;
}

interface ExtractedRecipeStep {
  position: number; title: string | null; instruction: string;
  ingredientGroupReferences: string[];
}
```

Rules: recipes without meaningful sections get one unnamed group, and a
single unnamed group displays no heading. Ranges ("1–2 tbsp", "15–20g")
are never collapsed to one number. Genuine alternatives share an
`alternativeGroupId`. Step titles only where meaningful — never "Step 1".

## 19. Validation & quality scoring

After each extraction: parse → runtime schema validation → empty strings
to null → drop empty groups/ingredients/steps → validate positions →
detect exact duplicates → validate ranges, times, alternative groups →
compare output against source evidence → compute a Cookdex quality score
→ accept / warn / retry / fail. **No model-generated confidence score.**

Minimum usable recipe: `extractionStatus = recipe`, title, ≥1 ingredient
with non-empty original text, ≥1 step with non-empty instruction.
Accept-with-warnings: missing servings, times, quantities, description,
tips. Reject / request more evidence: "recipe in bio" only; required
carousel slides unavailable; Reel depends on unavailable video; no
supported ingredients or steps; plausible recipe invented from a food
image; output contradicts retrieved evidence.

## 20. Retry rules

Retry (initial + max 2, exponential backoff with jitter): timeout,
connection failure, HTTP 429, 500–599, temporary provider failure.
Never auto-retry: invalid credentials, unsupported media, private/deleted
content, login wall, safety block, `not_recipe`, `insufficient_content`,
user cancellation. Schema-invalid structured output: exactly one targeted
correction request carrying the validation errors, then stop.

## 21. Import state machine

States: `created, policy_checked, retrieving_source,
source_partially_retrieved, source_retrieved, parsing_source,
ai_not_required, queued_for_ai, ai_processing, validating,
ready_for_review, saved, failed, cancelled`.

Failure reasons: `unauthenticated, plan_restricted, invalid_input,
unsupported_source, source_retrieval_failed, source_incomplete,
source_too_large, source_timeout, login_wall_detected, private_content,
deleted_content, not_a_recipe, insufficient_content, ai_rate_limited,
ai_provider_error, ai_safety_block, ai_output_invalid, validation_failed,
temporary_media_cleanup_failed, unknown_error`.

## 22. Idempotency

Every import carries an idempotency key. Before any paid call: return an
existing completed import; return current status when processing; create
another paid attempt only when retry rules permit. Applies independently
to URL-context, Apify, extraction, and correction calls. A double click
must never produce two paid calls of any kind.

## 23. Cost tracking

Categories: `direct_retrieval_cost, url_context_cost, apify_cost,
recipe_extraction_cost, correction_attempt_cost, retry_cost,
total_import_cost`. Direct retrieval records zero third-party cost but
still tracks execution count and latency.

Tables (columns as Freddi specified; Archie owns exact DDL):

- **source_retrieval_attempts**: id, recipe_import_id, user_id,
  attempt_number, resolver_id, provider_id, service_id, status,
  failure_reason, response_status, content_type, content_bytes,
  caption_retrieved, media_count, post_type, evidence_status,
  provider_request_id, external_run_id, units_used, unit_type,
  cost_micro_usd, cost_accuracy, raw_usage_json, latency_ms, started_at,
  completed_at, created_at.
- **ai_extraction_attempts**: id, recipe_import_id, user_id,
  attempt_number, provider_id, model_id, model_version,
  provider_request_id, request_modality, status, finish_reason,
  input_text_tokens, input_image_tokens, input_video_tokens,
  input_audio_tokens, tool_use_input_tokens, cached_input_tokens,
  output_candidate_tokens, output_thinking_tokens, output_tokens_total,
  input_cost_micro_usd, output_cost_micro_usd, total_cost_micro_usd,
  cost_accuracy, latency_ms, error_code, error_message_safe,
  raw_usage_json, started_at, completed_at, created_at.
- **external_service_pricing**: id, provider_id, service_id, model_id,
  unit_type, price_per_unit_micro_usd, currency, effective_from,
  effective_to, created_at. Must hold Gemini tokens, Apify results
  (~$2.70/1000 = 2700 micro-USD/result), Claude tokens, future providers.
  §0.3 note: sub-integer micro-USD unit prices exist — Archie decides
  representation (integer money at rest; no float arithmetic on money).

$1.00 = 1,000,000 micro-USD.

## 24. Admin usage view — `/admin/import-usage` (Freddi-only)

Totals: today / 7-day / 30-day / lifetime cost; average cost per import;
cost per successful import; per-category costs (retrieval, URL-context,
Apify, extraction, retry); no-AI imports; direct-IG success rate;
URL-context success rate; Apify fallback rate; user-input fallback rate;
success rate by source type; quality score by resolver route.

Instagram panel: attempts, direct-fetch success/partial, URL-context
attempted/succeeded, Apify calls made/avoided, manual fallback required,
average total cost per Instagram import.

Filters: source type, resolver, provider, model, status, failure reason,
date, plan, user.

## 25. Plan framework

Plans `free / premium / admin` prepared; `IMPORT_PLAN_ENFORCEMENT_ENABLED=false`
initially; every request still passes the policy service so enforcement
can be enabled later without rewriting the importer. Future entitlements
as listed in Freddi's spec (§25).

## 26. Security & privacy

Keys server-side only; auth required; RLS on import rows; admin data
protected; URL protocol validation; localhost/private-net rejection;
redirect re-checks; response size & duration caps; MIME validation;
temporary media private and deleted after use; no permanent Instagram
video storage; no binary media in logs; no full captions in general logs;
no raw provider responses to users. Compliance: public visibility ≠
permission to scrape; Instagram ToS prohibit automated collection without
permission; before broad public launch Freddi reviews the design,
attribution and storage behaviour, documents accepted risk, seeks legal
advice. The implementation claims no Instagram approval.

## 27–29. Test requirements, live PoC, migration tests

The automated test matrix of Freddi's §27 (direct-IG fixtures 1–20,
URL-context behaviours, Apify behaviours, extraction quality, exact cost
totals) is binding on Priya and Barry. §28 (100-post live PoC) and §29
(model migration benchmark) are deferred per §0.4–0.5; the benchmark
harness is built now so both can run when unblocked.

## 30–31. Handover gate & definition of done

As Freddi wrote them. Until §28 runs, the importer is described as
**"Implemented but Instagram retrieval not fully verified"** — never
"complete".
