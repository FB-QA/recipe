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

## 1. Shape of the design

The import returns the preview at ~9s with the composite cover. The clean cover is
fetched by a **route handler** (`POST /api/imports/[id]/cover`) the preview `fetch`es;
the preview shows a shimmer while it's in flight and swaps the cover in on success.

**On save before the cover lands (Q1) — REVISED:** the run is **not** cancelled. An
Apify run we have already paid to start is finished server-side (kept alive with
`after()`), and its clean image is applied wherever the import now is: patched onto
the import's `extracted.source.coverImageUrl` if still in review, or **upserted onto
the saved recipe's cover** if the run outran the save. Cancelling would burn the token
for nothing; completing gives a saved recipe its clean thumbnail a few seconds later,
in the background. The Apify call no longer takes a caller signal, and the client no
longer aborts on save.

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
`runPipelineFor` (`actions.ts`) no longer passes any cover enricher to the engine.
The pipeline finishes retrieval (direct) + AI and marks `ready_for_review` with the
composite cover. The old inline enrichment block in `engine.ts` was removed — the
single home for cover enrichment is now `enrich-cover.ts`.

Result: time-to-response drops to ~9s.

### 3.2 Route handler `POST /api/imports/[id]/cover`
1. Auth (`currentUser`); load row (`readById`). Cheap early-out on the shared
   `shouldEnrichCover` predicate **and** `config.apifyToken` — no ledger/Apify work
   unless: Apify is configured, switch on, Instagram import, state `ready_for_review`,
   cover still composite. Idempotent — a repeat is a no-op.
2. Start the enrichment **once** (`enrichImportCover`). The Apify resolver takes no
   caller signal, so a client disconnect does not cancel it. `after(() => enrichment)`
   keeps it alive past a disconnect; the synchronous `await` returns the clean cover
   for the live preview. Same promise → a single Apify run either way.
3. `enrichImportCover` records an `apify_cover` ledger attempt, then calls
   `onComplete(coverUrl | null, cost)` for **every** completed attempt (even a failed
   one) so the cost always reconciles with the ledger.
4. `onComplete` → `applyEnrichedCover` (state-aware): in review → patch the import
   cover (CAS same-state, atomic cost); already saved → `storeCoverFromUrl` upserts the
   clean image onto the recipe (atomic cost on the import); either way the cost is
   added in the database, never dropped.
5. Response returns `{ coverUrl: clean ?? current }`; failures keep the composite.

No `createRecipe` change to the save path itself: it persists the client's current
`importCoverUrl` (composite until the swap lands). The saved-recipe swap is done by
`applyEnrichedCover` via the shared `storeCoverFromUrl`, overwriting the same cover
path in place.

### 3.3 Store method
`updateExtractedCover(userId, importId, cleanUrl, costDeltaMicroUsd)` — patches the
`extracted` JSONB `source.coverImageUrl` and adds the cost. CAS-guarded to only
write while the row is still composite, so it cannot clobber a concurrent save.

## 4. Client changes (`import-flow.tsx` `Review` + `recipe-form.tsx`)

1. `Review` computes `coverPending` (§2) and holds the live cover URL in state,
   seeded with `recipe.source.coverImageUrl`.
2. If pending, on mount (guarded by a ref so it fires once) it `fetch`es
   `POST /api/imports/[id]/cover` with an `AbortController`.
3. While in flight: a **subtle loading overlay on the cover image** — the composite
   cover stays visible with a gentle shimmer + small spinner, matching the existing
   import-loading aesthetic. No blocking, no label.
4. On resolve: clean URL → swap the cover state (this also updates the
   `importCoverUrl` the form will save); `null` → clear the overlay, keep composite.
5. **Timeout cap (Q3):** `AbortSignal.timeout(~20s)` on the fetch; on timeout the
   overlay clears and the composite stands.
6. **Cancel on save (Q1):** the form's submit handler calls `abort()` before
   submitting, so an early save cancels the in-flight cover fetch and persists the
   composite `importCoverUrl`. The play-button thumbnail is kept, exactly as asked.

## 5. Edge cases & decisions

| Case | Behaviour |
|---|---|
| User saves before the cover lands | The fetch is `abort()`ed; save persists the composite cover (play-button thumbnail). No background completion. |
| Apify fails / times out / returns composite | Composite kept; nothing surfaced (cosmetic). Overlay clears on the 20s cap. User can replace the cover in the form. |
| Website / paste import | No composite cover → not pending → no fetch. Untouched. |
| Cache / already-saved hit | Already has a resolved cover → not pending → no fetch. Untouched. |
| Double fire (re-render) | Ref guard on the client; handler guard (§3.2.1) makes a repeat a no-op — no double Apify charge. |
| Cost tracking | `apify_cover` attempt recorded when the call runs to an attempt; admin usage view unchanged. |

## 6. Testing

- **Unit — cover route handler:** success updates cover + records cost + returns the
  clean URL; failure/abort returns `{ coverUrl: null }` and keeps composite;
  idempotent (already-clean returns without calling Apify); auth/state/source guards.
- **Unit — pipeline:** with no `coverEnricher`, `ready_for_review` carries the
  composite cover (no inline enrichment).
- **Existing engine cover tests:** unchanged (they pass their own enricher).
- **E2E:** the deferred path can't run Apify in CI (no token), so the swap is covered
  by unit tests and the loading overlay verified visually. Existing import E2E still
  covers the happy import → preview flow, and can assert the shimmer appears for a
  composite-cover import.

## 7. Rollout / reversibility

Behind the existing `reelCoverEnrich` config. The change is additive: if
`enrichImportCover` is never called, imports simply keep the composite cover (today's
fallback). No migration. Fully reversible by re-wiring `coverEnricher` into
`runPipelineFor`.

## 8. Decisions (Freddi, resolved)

- **Q1 — Save-before-cover:** cancel the in-flight fetch on save and keep the
  composite (play-button) thumbnail. No background completion, no saved-recipe update.
- **Q2 — Overlay style:** subtle shimmer + small spinner over the composite cover, no
  label.
- **Q3 — Timeout cap:** ~20s cap (`AbortSignal.timeout`); then clear the overlay and
  keep the composite.
