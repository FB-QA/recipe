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

## Build  (Barry)

**Branch:** dev/import-admin-usage-v2

**Status:** pending

---

## QA  (Priya)

**Branch:** test/import-admin-usage-v2

**Status:** pending

---

## Open questions for Freddi

- (none yet)
