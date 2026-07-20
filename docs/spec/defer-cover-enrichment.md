<!--
  Feature spec — Deferred Reel cover enrichment
  Owner: Tara · Status: DRAFT for discussion · Branch: feat/defer-cover-enrichment
-->

# Deferred Reel Cover Enrichment — Spec

## 0. Why (read first)

An Instagram Reel import takes ~20s to reach the preview. Measured on prod
(`recipe_imports` + attempt ledger), that breaks down as: direct retrieval ~1s,
**Apify cover enrichment ~10s**, AI extraction ~7–8s — run strictly sequentially.
The Apify cover call is the single biggest slice, and it produces something the
user does not need to see the recipe: a cleaner cover image. The AI extraction is
text-only and never touches the cover.

**Goal:** get the user to the preview in ~9s (retrieval + AI) instead of ~20s, by
moving the Apify cover enrichment OFF the critical path. The preview renders
immediately with the direct (composite, play-button) cover under a subtle loading
overlay; the clean Apify cover is fetched in the background and slots in when ready.

**Non-goals:** removing the creator's burned-in title text (that is in the source
frame, not ours to strip); changing website/paste imports; changing the AI step;
any new queue/worker infrastructure.

## 1. Platform constraint that shapes the design

The whole import runs inside one Vercel server action, awaited to completion. Vercel
serverless cannot reliably run fire-and-forget work AFTER the response is returned —
the function may freeze once the response flushes. So "background" here means
**client-triggered**: the preview, once rendered, fires a SECOND server action that
runs the Apify cover fetch and returns the clean URL. No queue, no worker, no
`waitUntil`. The second request's own lifetime covers the ~10s of work.

## 2. The pending signal (no new state)

The cover lives as a URL in `extracted.source.coverImageUrl`. The direct Reel cover
is Instagram's `cmp1` composite, detectable by `isCompositeReelCover(url)`
(`config.ts`). We derive "enrichment pending" from the data itself:

```
coverPending = isCompositeReelCover(recipe.source.coverImageUrl)
```

No new column, no flag to keep in sync. Once the cover is replaced by Apify's clean
(non-`cmp1`) URL, the value stops being a composite → not pending → self-healing.

## 3. Server changes

### 3.1 Main pipeline stops enriching inline
`runPipelineFor` (`actions.ts`) no longer passes `coverEnricher` to the engine. The
pipeline finishes retrieval (direct) + AI and marks `ready_for_review` with the
composite cover. The engine's existing enrichment block (`engine.ts:341–381`) stays
in place but dormant (it is gated on `deps.coverEnricher`); engine unit tests that
pass their own enricher are unaffected.

Result: time-to-`ready_for_review` drops to ~9s.

### 3.2 New action `enrichImportCover(importId)`
```
enrichImportCover(importId: string): Promise<{ coverUrl: string | null }>
```
1. Auth (`currentUser`); load row (`readById`).
2. Guards — return `{ coverUrl: current }` early (NO Apify call) if:
   - not an Instagram import, or
   - state is not `ready_for_review` / `saved`, or
   - the cover is already non-composite (already enriched — idempotent re-entry).
3. Run the Apify cover resolver (`createApifyResolver().resolve`).
4. Record an `apify_cover` retrieval attempt in the ledger
   (`openRetrievalAttempt` / `closeRetrievalAttempt`) — cost accounting stays
   identical to today, just recorded from here instead of the pipeline.
5. If a clean (non-`cmp1`) image returns: update `extracted.source.coverImageUrl`
   to it, add the cost to the row total, return `{ coverUrl: clean }`.
6. Otherwise return `{ coverUrl: null }` — keep the composite.

Idempotent and safe to call more than once: guard (2) short-circuits a repeat, so a
double-invoke or client retry cannot double-charge.

### 3.3 Store method
`updateExtractedCover(userId, importId, cleanUrl, costDeltaMicroUsd)` — patches the
`extracted` JSONB `source.coverImageUrl` and adds the cost. CAS-guarded to only
write while the row is still `ready_for_review` AND still composite, so it cannot
clobber a concurrent save or a second enrichment.

## 4. Client changes (`import-flow.tsx` `Review` + `recipe-form.tsx`)

1. `Review` computes `coverPending` (§2) and holds the live cover URL in state,
   seeded with `recipe.source.coverImageUrl`.
2. If pending, on mount (guarded by a ref so it fires once) it calls
   `enrichImportCover(importId)`.
3. While the call is in flight: a **subtle loading overlay on the cover image** —
   the composite cover stays visible with a gentle shimmer/pulse and a small spinner,
   matching the existing import-loading aesthetic. No blocking, no text required.
4. On resolve:
   - clean URL → swap the cover state to it (overlay clears because it is no longer
     composite);
   - `null` → clear the overlay, keep the composite silently.
5. The live cover URL is what feeds `RecipeForm`'s `importCoverUrl` (the hidden field
   that `createRecipe` persists via `uploadCoverFromUrl`). So when the clean cover
   lands, SAVE persists the clean cover — no separate wiring.

## 5. Edge cases & decisions

| Case | Behaviour |
|---|---|
| User saves before the cover lands (<~10s) | The composite cover is saved. Rare — users read a recipe for longer than 10s. (See open question Q1 for the nicer variant.) |
| Apify fails / times out / returns composite | Overlay clears, composite kept, no error surfaced (cosmetic). User can replace the cover in the form. |
| Website / paste import | No composite cover → `coverPending` false → no enrichment call. Untouched. |
| Cache / already-saved hit | Already has a resolved cover → not pending → no call. Untouched. |
| Double invoke (re-render / retry) | Client ref guard + action idempotency guard (§3.2.2). |
| Cost tracking | `apify_cover` attempt still recorded; admin usage view unchanged. |

## 6. Testing

- **Unit — `enrichImportCover`:** success updates cover + records cost; failure
  returns `null` and keeps composite; idempotent (already-clean returns without
  calling Apify); auth/state/source guards.
- **Unit — pipeline:** with no `coverEnricher`, `ready_for_review` carries the
  composite cover (no inline enrichment).
- **Existing engine cover tests:** unchanged (they pass their own enricher).
- **E2E:** the deferred path can't run Apify in CI (no token), so the enrichment
  swap is covered by unit tests; the loading overlay is verified visually. Existing
  import E2E still covers the happy import → preview flow.

## 7. Rollout / reversibility

Behind the existing `reelCoverEnrich` config. The change is additive: if
`enrichImportCover` is never called, imports simply keep the composite cover (today's
fallback). No migration. Fully reversible by re-wiring `coverEnricher` into
`runPipelineFor`.

## 8. Open questions (for discussion)

- **Q1 — Save-before-cover:** accept that an instant save keeps the composite
  (simplest), OR after such a save, finish enrichment and update the *saved recipe's*
  cover in the background too (more plumbing, a second update path)? Recommendation:
  accept composite for v1; revisit if it actually bites.
- **Q2 — Overlay style:** subtle shimmer + small spinner over the composite cover,
  no label — or a faint label ("sharpening cover…")? Recommendation: no label, keep
  it quiet.
- **Q3 — Give up after N seconds:** cap the background wait (e.g. 20s) and then clear
  the overlay to the composite, so a stuck Apify run never spins forever?
  Recommendation: yes, a ~20s client-side cap.
