---
slug: import-admin-usage-v2
project: recipe
type: user-story
created: 2026-07-17
status: ready-for-build
shape: surface
links: [spec/import-v2.md, user-story/import-engine-v2.md]
---

# Import admin usage v2 — cost visibility and the plan framework

## Story  (Tara)

As **Freddi**, I want **a private dashboard showing exactly what imports
cost and which resolver routes are earning their keep**, so that **I can
decide when Apify stays automatic, when Gemini gets keyed, and when plan
limits get switched on — from measured numbers, not guesses**.

Contract: `docs/spec/import-v2.md` §§23–25. Design note (Tara, decided):
internal tooling built from the app's existing tokens and components —
spec §24 enumerates the content field by field; no prototype stage. Maya
skipped on that basis.

### Acceptance criteria

- AC1 — `/admin/import-usage` shows total cost today / 7-day / 30-day /
  lifetime, average cost per import, cost per successful import, and the
  per-category breakdown (retrieval, URL-context, Apify, extraction,
  retry), all derived from the recorded attempt rows.
- AC2 — The Instagram panel shows attempts, direct-fetch success and
  partial counts, URL-context attempted/succeeded, Apify calls made and
  avoided, manual-fallback count, and average total cost per Instagram
  import.
- AC3 — I can filter by source type, resolver, provider, model, import
  status, failure reason and date; the numbers change accordingly.
- AC4 — Any signed-in user who is not the admin gets no dashboard and no
  data — the route behaves as if it doesn't exist; the underlying data is
  not readable through the API by non-admins either.
- AC5 — Plans (free/premium/admin) exist and every import passes the
  policy check, but with enforcement disabled no user's behaviour
  changes; flipping the enforcement flag requires no code change.

### Surfaces

- admin-import-usage (new page, existing tokens/components)

### Out of scope

- Any user-facing import behaviour change
- Plan limit values and enabling enforcement (Freddi's call, later)
- Billing/subscription anything

### Edge cases

- Zero imports in a filter window → zeros and empty states, no division
  errors.
- Costs recorded but import row failed → still counted in cost totals.

---

## Build  (Tara, solo — same branch, one PR)

- `/admin/import-usage` (outside the `(app)` group — internal tooling, no bottom
  nav). Admin-gated by `isAdmin` (`ADMIN_EMAIL`); non-admin → `notFound()` (AC4).
  The ledger tables grant nothing to `authenticated`, so the data is unreadable
  via the API regardless — defence in depth.
- `usage.ts` — `computeUsage` (pure, tested): cost windows (today/7d/30d/
  lifetime), avg-per-import, per-success, cost-by-category, Instagram funnel
  panel, resolver rates, success-by-source, quality-by-resolver, no-AI count.
- `usage-queries.ts` — service-role fetch (date-windowed) + `applyFilters` /
  `filterOptions` (pure, tested). Filters: window, source, state, failure,
  resolver, provider, model (AC3).
- `plan.ts` — free/premium/admin entitlements + `planAllows` hook, disabled by
  `IMPORT_PLAN_ENFORCEMENT_ENABLED` (AC5 — flip-to-enable, no importer rewrite).

**Test run:**
```
Vitest 28 files / 172 tests pass · tsc 0 · eslint clean · next build (/admin/import-usage registered)
computeUsage / applyFilters / isAdmin unit-tested; unauth route → 307 login, non-admin → 404.
```

**Status:** done

---

## QA  (Priya)

**Branch:** test/import-admin-usage-v2

**Status:** pending

---

## Open questions for Freddi

- (none yet)
