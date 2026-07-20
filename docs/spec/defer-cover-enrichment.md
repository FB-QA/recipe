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

The whole import runs inside one Vercel server action, awaited to completion. Naive
fire-and-forget after the response is unsafe — the function can freeze once the
response flushes.

Because the saved recipe must get the clean cover **even if the user saves before it
arrives** (Q1), the enrichment cannot depend on the client staying on the page — a
client-triggered call dies when the user navigates away on save. So the enrichment
runs **server-side to completion** via Next's `after()` (stable in Next 16):
`submitUrlImport` returns the ready envelope at ~9s, and `after()` keeps the function
alive to run the ~10s Apify fetch and persist the result. Same total function time as
today's synchronous run (~19s) — the user just gets the response at 9s instead of 20s.
No queue, no worker.

The client learns the cover landed by **polling** the existing `getImportStatus`
(the app already has `useImportPolling`); it does not call the enrichment itself.

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
pass their own enricher are unaffected. After the pipeline returns a `ready`
outcome, `submitUrlImport` schedules `after(() => enrichCoverInBackground(importId,
userId))`.

Result: time-to-response drops to ~9s.

### 3.2 `enrichCoverInBackground(importId, userId)` — runs inside `after()`
1. Load row (`readById`). Guards — return early (NO Apify call) unless: Instagram
   import, state `ready_for_review`/`saved`, and cover still composite
   (`isCompositeReelCover`). This makes it idempotent — a repeat is a no-op.
2. Run the Apify cover resolver (`createApifyResolver().resolve`).
3. Record an `apify_cover` retrieval attempt in the ledger
   (`openRetrievalAttempt` / `closeRetrievalAttempt`) — cost accounting is identical
   to today, just recorded from here.
4. If a clean (non-`cmp1`) image returns:
   - Update the import's `extracted.source.coverImageUrl` to it (CAS: only while
     still composite), add cost to the row total.
   - **Early-save handling (Q1):** if the import is already saved (`recipe_id` set),
     download+store the clean cover and update the recipe's `cover_image_path`, then
     `revalidatePath('/recipes/{id}')` so the next view shows it.
5. Otherwise leave the composite in place.

Failures are swallowed (logged) — a background cosmetic step never breaks the import.

### 3.3 Save prefers the server-side cover (`createRecipe`)
When saving from an import (`importId` present, `coverAction === "keep"`),
`createRecipe` reads the import row's CURRENT `extracted.source.coverImageUrl`
server-side and uses that for `uploadCoverFromUrl`, rather than trusting the client's
hidden field alone. This closes the race: whether enrichment finished just before or
just after the click, the recipe ends up with the clean cover (§3.2.4 covers the
after case; this covers the before case).

### 3.4 Store method
`updateExtractedCover(userId, importId, cleanUrl, costDeltaMicroUsd)` — patches the
`extracted` JSONB `source.coverImageUrl` and adds the cost. CAS-guarded to only
write while the row is still composite, so it cannot clobber a concurrent save.

## 4. Client changes (`import-flow.tsx` `Review` + `recipe-form.tsx`)

1. `Review` computes `coverPending` (§2) and holds the live cover URL in state,
   seeded with `recipe.source.coverImageUrl`.
2. If pending, it **polls `getImportStatus(importId)`** (~1.5s cadence, reusing the
   `useImportPolling` shape) until the returned recipe's cover is no longer composite,
   then swaps the cover state to the clean URL and stops.
3. While pending: a **subtle loading overlay on the cover image** — the composite
   cover stays visible with a gentle shimmer + small spinner, matching the existing
   import-loading aesthetic. No blocking, no label.
4. **Timeout cap (Q3):** stop polling after ~20s regardless; clear the overlay and
   keep the composite. A stuck Apify run never spins forever.
5. The live cover URL feeds `RecipeForm`'s `importCoverUrl`. Combined with §3.3
   (save reads the server-side cover), SAVE persists the clean cover whether or not
   the poll has caught up on the client yet.

## 5. Edge cases & decisions

| Case | Behaviour |
|---|---|
| User saves before the cover lands | Save persists whatever cover is current; the `after()` enrichment then updates the *saved recipe's* cover and revalidates it (§3.2.4 + §3.3). The recipe ends clean; the user sees it on the next view of that recipe. |
| Apify fails / times out / returns composite | Composite kept; nothing surfaced (cosmetic). Overlay clears on the client cap. User can replace the cover in the form. |
| Website / paste import | No composite cover → not pending → no enrichment scheduled. Untouched. |
| Cache / already-saved hit | Already has a resolved cover → not pending → no enrichment. Untouched. |
| Double schedule / re-entry | Idempotency guard (§3.2.1): once the cover is non-composite, any repeat is a no-op — no double Apify charge. |
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

## 8. Decisions (Freddi, resolved)

- **Q1 — Save-before-cover:** background-update the saved recipe too. The `after()`
  enrichment updates the recipe's `cover_image_path` when it finds the import already
  saved, and revalidates the recipe page (§3.2.4). The recipe always ends with the
  clean cover.
- **Q2 — Overlay style:** subtle shimmer + small spinner over the composite cover, no
  label.
- **Q3 — Timeout cap:** ~20s client-side cap on the poll; then clear the overlay and
  keep the composite.
