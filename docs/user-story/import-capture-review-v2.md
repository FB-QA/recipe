---
slug: import-capture-review-v2
project: recipe
type: user-story
created: 2026-07-17
status: drafting
shape: journey
links: [spec/import-v2.md, user-story/import-engine-v2.md]
---

# Import capture & review v2 — screenshots in, faithful editable preview out

## Story  (Tara)

As a **Cookdex user**, I want **to import a recipe from screenshots and
review every import in an editable preview that shows the recipe exactly
as the source structured it**, so that **I can trust what I'm saving and
fix anything before it lands in my collection**.

Contract: `docs/spec/import-v2.md` §§13, 18–19, 26 (temporary media),
plus the engine and schema delivered by `import-engine-v2`. Design note
(Tara, decided): no new prototype — the preview extends the existing
validated import-drawer components and tokens; the screenshot picker
follows the app's existing upload patterns. Maya skipped on that basis;
any visual gap Barry hits is a Channel-2 question, not an invention.

### Acceptance criteria

- AC1 — I can select one or more screenshots (order preserved), and they
  produce a single draft recipe; unsupported file types, oversized files
  and over-count selections are rejected with a clear message before any
  paid work happens.
- AC2 — Temporary screenshot files are gone after the import completes,
  fails, or is cancelled — nothing lingers in storage.
- AC3 — The editable preview renders ingredient groups with their names
  and order, shows ranges as ranges, marks optional items, and presents
  alternatives together; a recipe with one unnamed group shows no group
  heading at all.
- AC4 — Saving a confirmed draft persists groups, ordering, range/optional
  /alternative detail and step titles, and the recipe detail page renders
  them faithfully; grocery-list behaviour on such a recipe is unchanged.
- AC5 — Uploading a video is refused with an honest "video import isn't
  supported yet" message — never a fake attempt or a silent failure.

### Surfaces

- import-drawer (screenshot capture entry + preview with groups)
- recipe-detail (grouped ingredients, step titles)
- recipe-form (edit preserves group structure)

### Out of scope

- Any change to the engine's resolver/provider behaviour
- Admin dashboard (story `import-admin-usage-v2`)
- Video extraction pipeline (spec §0.2)

### Edge cases

- Screenshot with no legible recipe → `insufficient_content` outcome with
  the user fallback, not an invented recipe.
- Mixed-orientation / very tall screenshots → order and legibility
  preserved (no aggressive compression on text).
- Editing a draft to delete the last ingredient of a group → group is
  removed cleanly, positions re-sequenced.

---

## Build  (Barry)

**Branch:** dev/import-capture-review-v2

**Status:** pending

---

## QA  (Priya)

**Branch:** test/import-capture-review-v2

**Status:** pending

---

## Open questions for Freddi

- (none yet)
