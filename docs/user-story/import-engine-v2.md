---
slug: import-engine-v2
project: recipe
type: user-story
created: 2026-07-17
status: ready-for-qa
shape: compute
architecture: three new cost/attempt tables, recipe_imports state machine + idempotency, and a recipe schema extension for ingredient groups/ranges/alternatives/step titles
links: [spec/import-v2.md]
---

# Import engine v2 — resolver chain, provider abstraction, faithful extraction

## Story  (Tara)

As a **Cookdex user**, I want **pasted text, recipe website URLs and public
Instagram links turned into faithful, editable recipe drafts using the
cheapest reliable method**, so that **I can save recipes without retyping
them and without the app inventing details or burning money on every
import**.

The engineering contract is `docs/spec/import-v2.md` in full — §0
(implementation reality) governs wherever it and the original spec text
differ. This story is the backend replacement of `src/lib/import/`:
source evidence model, resolver chain, evidence gate, provider registry
(Claude live, Gemini config-gated), extraction schema with groups /
ranges / alternatives, validation + quality scoring, retry rules, state
machine, idempotency, and full cost tracking. UI changes are limited to
the error/fallback messaging the new outcomes require.

### Acceptance criteria

- AC1 — Importing a website URL whose page carries complete structured
  recipe data produces a draft with zero AI attempts recorded against the
  import.
- AC2 — Importing a website URL without usable structured data produces a
  draft whose ingredients and steps come from the page, preserving
  ingredient section groupings and order, quantity ranges (e.g. "1–2
  tbsp" stays a range), optional ingredients, and genuine alternatives as
  written.
- AC3 — Importing a public Instagram URL attempts a direct page read
  first; the paid scraper runs only when the direct read yields
  insufficient evidence, and every attempt (resolver, outcome, cost) is
  recorded on the import.
- AC4 — An Instagram post whose caption says "recipe in bio", or a teaser
  Reel with no recipe text, never produces an accepted recipe; the user
  is told retrieval (not AI) fell short and offered paste caption /
  upload screenshots / add manually.
- AC5 — Pasted recipe text produces a draft preserving original wording,
  order, groups, ranges, optionals and alternatives; information absent
  from the source stays empty rather than invented.
- AC6 — Submitting the same import twice in quick succession performs the
  paid work once; the second submission returns the first's result or
  in-flight status.
- AC7 — Every retrieval attempt and every AI attempt leaves a row
  recording units/tokens used and cost in micro-USD, and the import row
  carries its state-machine state and, on failure, a specific failure
  reason.
- AC8 — Transient provider failures retry at most twice with backoff;
  content failures (not a recipe, private post, deleted post, login
  wall) are never auto-retried; a schema-invalid AI response gets exactly
  one correction attempt.
- AC9 — Switching extraction provider or model is a configuration-only
  change; with no Gemini key configured the system runs entirely on the
  Claude adapter and the Gemini rungs report themselves unavailable
  rather than silently vanishing.

### Surfaces

- import-drawer (existing — outcome/fallback messaging only; no layout change)
- paste-flow (existing — outcome messaging only; no layout change)

### Out of scope

- Screenshot/image upload UI and multimodal capture flow (story
  `import-capture-review-v2`)
- Editable-preview rendering of groups/ranges and the save path (story
  `import-capture-review-v2`)
- `/admin/import-usage` dashboard and plan surfaces (story
  `import-admin-usage-v2`)
- Video extraction (no video-capable provider keyed — spec §0.2)
- Live 100-post Instagram PoC and Gemini live verification (spec §0.4–0.5)
- Plan enforcement (framework only, disabled — spec §25)

### Edge cases

- Carousel with missing slides → `partial` evidence, next rung, never a
  silently accepted recipe.
- Redirect to another Instagram URL → re-validated; redirect to a
  non-Instagram or private-net destination → rejected.
- Oversized response / timeout → capped and recorded, `source_timeout` /
  `source_too_large`.
- Caption ending in truncation markers ("… more") → `caption_may_be_truncated`.
- Instagram page structure unrecognised → `source_format_changed`, chain
  continues; parser modules fail independently.
- **Login wall in disguise (defensive, not the common case):** anonymous
  fetch *can* return HTTP 200 with login-shell HTML (`loginPage` markers,
  zero OG tags, zero caption JSON). The direct resolver must detect that and
  emit `login_wall_detected`, never judging success by status code or byte
  count (§27 fixture 9). **Re-measured live 2026-07-18: direct fetch usually
  SUCCEEDS** — public posts and reels alike return 200 with the full caption
  and an `og:image` cover; the login shell is occasional, not the norm. The
  more common fall-through is a page whose caption the parser can't locate
  (`caption_missing` / `source_format_changed`), which continues the chain
  correctly. Net: Apify is a rare fallback, not the default path.

---

## Architecture  (Archie)

Read the access patterns before naming a column: 9 reads, 6 writes, at a
design point of thousands of imports and tens of thousands of attempt rows.
Two new ledger tables plus pricing, an additive extension of `recipe_imports`
(nullable `state` marks legacy v1 rows), and the relational
groups/ranges/alternatives extension of the recipe children. Six indexes, each
for a uniqueness invariant, FK cascade, or hot point-lookup — none for scan
avoidance. The §0.3 money-representation question is settled: unit prices are
integer **nano-USD** per unit (`price_per_unit_nano_usd bigint`), computed
costs are integer micro-USD `bigint` throughout, round-half-up per component
at attempt write time — no float touches money. Idempotency: the import row
itself is the claim (unique `(user_id, idempotency_key)` +
`INSERT ... ON CONFLICT`), paid calls are a write-ahead attempt ledger under
CAS state transitions — a double click structurally cannot pay twice. One
envelope (`ImportResult` discriminated union) across all three server actions;
keyset pagination `(created_at DESC, id)` reserved surface-wide for the admin
story. Migration is forward-only additive; the only destructive work (v1
column drops, `state` backfill) is flagged for approval, not performed.

**Files:**

- `docs/architecture/import-engine-v2/access-patterns.md`
- `docs/architecture/import-engine-v2/schema.md`
- `docs/architecture/import-engine-v2/indexes.md`
- `docs/architecture/import-engine-v2/api.md`
- `docs/architecture/import-engine-v2/migration.md`
- `docs/architecture/import-engine-v2/decision.md`

**Status:** done

---

## Build  (Barry → finished solo by Tara after a usage-credit cutoff)

**Branch:** dev/import-engine-v2

Barry built every leaf module (schema, config, evidence gate, validation/quality,
pricing, messages, retry, both provider adapters, both Instagram resolvers,
migration) then died mid-build on a usage-credit cutoff with the work uncommitted.
Tara recovered it (commit `wip(...)`) and finished the integration spine solo:
the remaining resolvers, the registry, the orchestrator engine, the persistence
store, the actions rewrite, the UI wiring, and v1 retirement.

**File map:**
- `src/lib/import/schema.ts` — the one type home (§6–§10, §15, §18, §21) + `ImportResult` envelope
- `src/lib/import/config.ts` — provider config; model IDs live here + adapters only (AC9)
- `src/lib/import/evidence.ts` — §10 acceptance gate (recipe-in-bio never sufficient)
- `src/lib/import/validate.ts` — normalise (drop, never invent), minimumUsable, Cookdex quality score
- `src/lib/import/pricing.ts` — integer nano-USD → micro-USD, round-half-up, overflow guard
- `src/lib/import/messages.ts` — failure-reason → user copy + fallback (retrieval ≠ AI error)
- `src/lib/import/retry.ts` — §20 classification + backoff
- `src/lib/import/providers/anthropic.ts` — live Claude adapter (structured output)
- `src/lib/import/providers/gemini.ts` — config-gated Gemini adapter (built, unregistered w/o key)
- `src/lib/import/resolvers/instagram-direct.ts` — §9.1 direct fetch; login-shell detection (fixture 9)
- `src/lib/import/resolvers/gemini-url-context.ts` — §9.2 two-stage, config-gated
- `src/lib/import/resolvers/apify.ts` — §9.3 wraps the v1 leaf; discards non-recipe fields
- `src/lib/import/resolvers/website.ts` — §11 JSON-LD skip-AI + page-text-for-AI (pure `interpretWebsiteHtml`)
- `src/lib/import/resolvers/pasted-text.ts` — §12
- `src/lib/import/registry.ts` — ordered chain per source; config-gated rungs surfaced, not dropped (AC9)
- `src/lib/import/engine.ts` — orchestrator: retrieval/AI separation, gate, deterministic path, retry/correct, per-attempt cost, CAS transitions
- `src/lib/import/store.ts` — service-role W1–W4/R1–R7 + R6 prices; untyped DB boundary isolated here
- `src/lib/import/to-form.ts` — flatten v2 recipe → existing review form (groups persist next story)
- `src/lib/import/actions.ts` — `submitUrlImport`/`submitPasteImport`/`getImportStatus` → one envelope
- `src/components/import/import-flow.tsx`, `paste-flow.tsx`, `import-failure.tsx` — UI on the envelope
- `supabase/migrations/20260717150000_import_engine_v2.sql` — Archie's ledgers + CAS fn + seeds (applied clean to local stack)
- removed: v1 `pipeline.ts`, `ai.ts`, `types.ts`, `pipeline.test.ts`

**AC coverage:**
- AC1 — website JSON-LD path returns `deterministicRecipe`, engine records zero AI attempts — `engine.ts::runImportPipeline` (deterministic branch), `resolvers/website.ts::interpretWebsiteHtml`
- AC2 — verbatim wording, groups, ranges, optionals, alternatives — `validate.ts::normaliseRecipe`, `providers/anthropic.ts` schema
- AC3 — direct-first, Apify only on insufficiency, every attempt recorded — `engine.ts` chain loop + W3
- AC4 — recipe-in-bio / teaser never accepted; retrieval framed as retrieval — `evidence.ts::decideEvidence`, `messages.ts`
- AC5 — paste preserves wording/order/structure, absent stays empty — `resolvers/pasted-text.ts` + provider prompt §17
- AC6 — double-submit does the paid work once — `store.ts::claimImport` (W1) + unique index; `actions.ts` race re-read
- AC7 — every retrieval + AI attempt costed in micro-USD; import carries state + failure reason — `engine.ts` W3/W4 + `store.ts`
- AC8 — transient retry ≤2, content failures no retry, schema-invalid one correction — `engine.ts::runExtractionWithRetry`, `retry.ts`
- AC9 — provider/model switch is config-only; gated rungs report unavailable — `registry.ts`, `engine.ts` gated-rung recording

**AC routing:**
- AC1 — unit: `engine.test.ts` "AC1 — deterministic JSON-LD spends no AI" + `resolvers/website.test.ts`
- AC2 — unit: `validate.test.ts`, `resolvers/website.test.ts`; live: `scripts/verify-import-live.mts` (real Claude output)
- AC3 — unit: `engine.test.ts` "AC3 — Apify runs only after cheaper rungs fall short"
- AC4 — unit: `engine.test.ts` "AC4 — retrieval failures never yield an accepted recipe"
- AC5 — unit: `resolvers/pasted-text.test.ts`, `to-form.test.ts`; live e2e: `scripts/verify-import-e2e.mts`
- AC6 — integration: `scripts/verify-import-e2e.mts` (duplicate claim `raced=true` against the real unique index)
- AC7 — unit: `engine.test.ts` "AC7 …"; integration: e2e ledger rows (cost 6039 micro-USD reconciled)
- AC8 — unit: `engine.test.ts` "AC8 — retry transient once-per-rule; correct schema-invalid exactly once"
- AC9 — unit: `registry.test.ts`, `engine.test.ts` "AC9 — gated rungs are recorded"

**Integration tests:** the persistence contract (W1–W4, R1–R7, CAS RPC, cost) is exercised end-to-end
against the local Supabase stack by `scripts/verify-import-e2e.mts` — the migration applied clean, a real
Claude extraction persisted `state=ready_for_review`, and the attempt ledgers + `total_cost_micro_usd`
reconciled to the nano-USD price book. A committed Vitest integration suite against a throwaway PG schema
is a follow-up for Priya (named as residual, below) — the harness proves the contract now.

**Test run:**
```
# Unit + component (Vitest)
Test Files  22 passed (22)
      Tests  138 passed (138)
# tsc --noEmit: 0 errors    # eslint src/lib/import src/components/import --max-warnings=0: clean
# next build: 20/20 routes compiled

# Live external (scripts/verify-import-live.mts)
1. RecipeTin Eats bolognese → JSON-LD: 16 ingredients, 10 steps, verbatim "1 1/2 tbsp olive oil" → ZERO AI (AC1)
2. Claude haiku-4-5 extraction → schema-valid, quality 90/100:
   groups "For the base"/"For the topping"; range "1-2 tbsp" → min1 max2;
   alternative "pecans OR digestive biscuit"; optional honey; titles "Roast…"/"Make…"/"Combine…"

# Full e2e vs local Supabase (scripts/verify-import-e2e.mts)
W1 claim ✓  AC6 duplicate claim raced=true ✓  pipeline → ready quality=90
recipe_imports: state=ready_for_review, total_cost_micro_usd=6039, extracted persisted with named groups
ai_extraction_attempts: 1× initial/succeeded, 6039 micro-USD (1929 in ×1000 + 822 out ×5000 ÷1000) ✓ exact
source_retrieval_attempts: 1× pasted_text/succeeded, unit_type=request, cost 0 metered
```

**Status:** done

**Residual for Priya:**
- Instagram live path is unverified by design (spec §0.4 — 100-post PoC deferred; needs real post URLs + Freddi).
  Direct-fetch login wall is confirmed and handled; Apify token present but the resolver→ledger path is
  unit-tested, not live-run against a real scrape.
- A committed Vitest integration suite (throwaway PG) mirroring `verify-import-e2e.mts` would replace the
  script as the permanent record.
- Video/screenshot paths are out of scope (spec §0.2, story `import-capture-review-v2`).

---

## QA  (Priya)

**Branch:** test/import-engine-v2

**Status:** pending

---

## Open questions for Freddi

- **[Archie — Channel 2] v1 `recipe_imports` cleanup migration (destructive,
  deferred).** v2 extends the table additively; legacy rows keep working via
  the old columns (`status`, `method`, `estimated_cost_cents`, `media_url`)
  with `state IS NULL` marking them. The eventual cleanup — backfilling
  `state NOT NULL` (lossy mapping: v1 `no_recipe` conflates
  `not_a_recipe`/`insufficient_content`) and dropping the four v1 columns plus
  the `import_status` enum — is destructive and is **not** in this story's
  migration. Proposed resolution: approve it as a standalone migration after
  `import-admin-usage-v2` ships and nothing reads the v1 columns; until then
  they cost bytes, not correctness. Full mapping and rollback notes in
  `docs/architecture/import-engine-v2/migration.md`, "Flagged for approval".
