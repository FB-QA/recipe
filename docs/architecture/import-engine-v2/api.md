# Import Engine v2 — API Contract

This surface has **no REST routes** — the app's server boundary is Next.js
server actions (`"use server"`), consistent with v1 (`src/lib/import/actions.ts`)
and the rest of the project (the only route handler is `api/image-proxy`).
The contract below is what Barry's integration tests pin: action signatures,
one result envelope, one failure-reason mapping. Anything returned outside
this envelope is a Channel-2 deviation.

## Envelope — decided once, reused by every action

```ts
// src/lib/import/schema.ts — the single type home

type FallbackKind = "paste_caption" | "upload_screenshots" | "add_manually";

type ImportResult =
  | { phase: "exists";     recipeId: string; title: string; coverUrl: string | null }
  | { phase: "processing"; importId: string; state: ImportState }
  | { phase: "ready";      importId: string; recipe: ExtractedRecipe;
      qualityScore: number; warnings: ExtractionWarning[] }
  | { phase: "failed";     importId: string | null; failureReason: ImportFailureReason;
      message: string; fallback: FallbackKind[] };
```

Rules:

1. **Domain failures never throw.** Every outcome — including rate limit,
   invalid input, retrieval failure — is a `failed` envelope. Thrown errors
   are reserved for the auth redirect path (existing `SIGNED_OUT_ERROR`
   convention).
2. **`message` is user-facing copy, derived only from the mapping table
   below** — never provider text, never raw error strings (§26).
3. **`fallback` is non-empty exactly when the user has a manual recovery
   route** (AC4) — the import-drawer renders its options from this array, no
   layout change.
4. **One envelope for URL, paste, and status** — Priya tests one shape, not three.

## Actions

| Action | Signature | Notes |
|---|---|---|
| `submitUrlImport` | `(prev, formData{ url, idempotencyKey }) => ImportResult` | Full pipeline for website + Instagram URLs. R3 cache short-circuit and the `exists` check precede any paid work. |
| `submitPasteImport` | `(prev, formData{ text, idempotencyKey }) => ImportResult` | Pasted-text flow (§12). Same envelope; `exists` phase never occurs. |
| `getImportStatus` | `(importId: string) => ImportResult` | R2 poll for an in-flight import; returns `processing`, `ready`, or `failed`. Applies the R7 stale-in-flight rule. |

All three run auth → policy check first; `unauthenticated` and the daily cap
(`plan_restricted` is reserved for §25; the current cap maps to the existing
limit copy) return `failed` envelopes before any row is written.

## Idempotency-key rule (surface-wide, §22 / AC6)

- The **client generates** a UUIDv4 per logical submission and holds it in the
  form state; a double click or React re-submit re-sends the same key. The key
  is regenerated only when the user edits the input (new logical submission).
- The **server claims** the key with W1 (`INSERT ... ON CONFLICT DO NOTHING`).
  Losing the race ⇒ read the winner (R1) and return its envelope. Per-paid-call
  idempotency inside the pipeline is the attempt ledger's job (W3/W4 +
  unique attempt indexes) — the action layer never re-checks it.
- A missing or malformed `idempotencyKey` is `failed`/`invalid_input` — the
  server never invents one, because a server-generated key cannot deduplicate
  a double submission.

## Pagination — none on this surface, rule reserved

No action returns a list this story. The surface-wide rule, so it is decided
once: **any future list over imports or attempts paginates keyset on
`(created_at DESC, id)`** — offset drifts under concurrent inserts and this
ledger only ever grows. `import-admin-usage-v2` inherits this; re-deciding
there is a flagged re-decide, not a free choice.

## Failure-reason → user message + fallback mapping

The complete mapping. Barry implements it as a single lookup
(`src/lib/import/messages.ts`); integration tests pin retrieval-vs-AI wording
(AC4: retrieval failures are never presented as AI errors).

| `failureReason` | Message (user-facing intent) | `fallback` |
|---|---|---|
| `unauthenticated` | existing signed-out copy | `[]` |
| `plan_restricted` | daily-limit copy (existing v1 wording) | `["add_manually"]` |
| `invalid_input` | "That doesn't look like a link/recipe text we can import." | `["add_manually"]` |
| `unsupported_source` | "We can't import that kind of link yet." | `["paste_caption","add_manually"]` |
| `source_retrieval_failed` | "We couldn't read this page/post automatically." | `["paste_caption","upload_screenshots","add_manually"]` |
| `source_incomplete` | "We couldn't get the whole post (missing slides/caption)." | `["paste_caption","upload_screenshots","add_manually"]` |
| `source_too_large` | "That page is too large to import." | `["paste_caption","add_manually"]` |
| `source_timeout` | "That site took too long to respond." | `["paste_caption","add_manually"]` |
| `login_wall_detected` | "That post is behind a login." | `["paste_caption","upload_screenshots","add_manually"]` |
| `private_content` | "That post looks private." | `["paste_caption","upload_screenshots","add_manually"]` |
| `deleted_content` | "That post seems to have been removed." | `["add_manually"]` |
| `not_a_recipe` | "We read it, but couldn't find a recipe there." | `["add_manually"]` |
| `insufficient_content` | "The post doesn't contain the full recipe (e.g. 'recipe in bio')." | `["paste_caption","upload_screenshots","add_manually"]` |
| `ai_rate_limited` / `ai_provider_error` | "Our extraction service is busy — try again shortly." | `["paste_caption","add_manually"]` |
| `ai_safety_block` | "We couldn't process this content." | `["add_manually"]` |
| `ai_output_invalid` / `validation_failed` | "We couldn't produce a reliable draft from this source." | `["paste_caption","add_manually"]` |
| `temporary_media_cleanup_failed` | surfaced as success-with-warning path, not user-blocking | n/a |
| `unknown_error` | "Something went wrong on our side." | `["paste_caption","add_manually"]` |

`upload_screenshots` renders as a described option only — the capture flow
ships in `import-capture-review-v2`; until then the drawer shows
paste-caption / add-manually as actionable (Tara's surface note: messaging
only, no layout change).

## Provider/resolver internal interfaces

`SourceResolver`, `RecipeExtractionProvider`, `NormalizedImportInput`,
`EvidenceDecision` are internal contracts, verbatim from spec §7/§8/§10/§15,
typed in `src/lib/import/schema.ts`. They are not part of this action surface
but the same one-home rule applies: registered via a registry keyed by
`resolverId`/`providerId`, with the Gemini pair registered **only when**
`GOOGLE_API_KEY` is present (§0.1) and reported `unavailable` otherwise (W3).
Model IDs appear only in configuration (`AI_PRIMARY_PROVIDER`,
`AI_PRIMARY_MODEL`, `AI_REPLACEMENT_MODEL`) and inside provider adapters (§3).
