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

_Frontmatter `architecture:` is set — Archie fills this section._

**Files:** _(paths under `docs/architecture/import-engine-v2/`)_

**Status:** pending

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

- (none yet)
