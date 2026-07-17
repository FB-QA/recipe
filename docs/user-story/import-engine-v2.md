---
slug: import-engine-v2
project: recipe
type: user-story
created: 2026-07-17
status: ready-for-build
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

## Build  (Barry)

**Branch:** dev/import-engine-v2

**Status:** pending

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
