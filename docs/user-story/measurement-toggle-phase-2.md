---
slug: measurement-toggle-phase-2
project: recipe
type: user-story
created: 2026-07-21
status: ready-for-qa
shape: journey
links: [spec/measurement-conversion.md, user-story/measurement-conversion-foundation.md]
---

# Measurement toggle + portion integration (Phase 2)

## Story (Tara)

As a **Cookdex cook**, I want **a measurement selector on every recipe that
re-renders ingredient amounts (and oven temperatures) in my chosen system,
live, alongside the portions control**, so that **I can read any recipe in the
units I think in — without the stored recipe ever changing**.

Built solo (Freddi's standing order: no agents, all hats). Design direction
supplied by Freddi (native select, stacked on narrow, no 4-way segmented
control). Wires the Phase 1 engine into the real cook path.

### Key code finding that shaped it

Existing portion scaling is **text-based** (`scale.ts:scaleIngredientText`,
regex over `display_text`), never structured. The engine needs structured
fields. So Phase 2 threads `quantity_value/min/max` through to the render path
and introduces one bridge that scales-then-converts from the ORIGINAL numeric,
falling back to the text scaler whenever structured conversion is unavailable.

### Acceptance criteria

- **AC1** — Every recipe shows a measurement selector with **three** options —
  **Original / Metric / US customary** — beside the portions stepper; stacks
  below on narrow screens; ≥44px target; native `<select>` (keyboard + SR).
  Works logged-out. **UK/Ireland is deliberately NOT a target option** (its
  output equals Metric today, and an "Imperial" umbrella is ambiguous/unsafe);
  UK/IE is retained internally as a SOURCE region for reading imperial pints. A
  later "My units" (saved preference → Metric or US) can replace the list.
- **AC2** — Switching system re-renders ingredient amounts live, no reload.
- **AC3** — Amounts are calculated from the ORIGINAL structured value: scale →
  convert → format. No drift across repeated portion/system changes.
- **AC4** — Region-sensitive units (cup, pint, US spoons) convert only when the
  source region is known (minimal strong-signal detection); otherwise they stay
  original. Region-independent units (weight, ml/L, temperature) always convert.
- **AC5** — Volume→volume with a known region is exact, not marked approximate
  (`1 US cup → 237 ml`). Approximate conversions show `≈` + SR text.
- **AC6** — Explicit oven temps in method text convert at display time
  (`350°F → 175°C`, `Gas Mark 4 → 180°C`), oven-dial rounding (°F→25, °C→5).
  Stored instruction unchanged; no persisted spans.
- **AC7** — "Original" restores the exact imported text at the current portion
  count (double portions in Original → `2 cups flour`).
- **AC8** — One odd ingredient never breaks the recipe: unknown units, missing
  quantities, unsupported conversions fall back to the (scaled) original.
- **AC9** — A measurement change is announced via an `aria-live` region.

### Surfaces

- recipe-detail (`[id]/page.tsx`) — detects source region server-side, passes down
- `cook-sections` — owns `system` state + the live-region announcement
- `ingredients-section` — the toggle in the header; amounts via the bridge
- `method-steps` — in-step temp conversion + drawer amounts via the bridge
- `measurement-toggle` (new) — the native selector

### Out of scope (later phases)

- Ingredient volume↔weight (cup→grams) — Phase 3 (needs density corpus)
- Persistence of the selection (per-recipe / user default) — Phase 6
- Tin/length conversion in instructions, persisted spans — Phase 5
- Per-ingredient tap-to-reveal original — Phase 6
- Full confidence-scored region detection — Phase 3

## Verification (test-first)

- **Unit** — `measurement-region` (7), `ingredient-amount` bridge (10),
  `instruction-temp` (7).
- **Component (render + journey, jsdom)** — `measurement-toggle` (3),
  `ingredients-section` (3): Original → Metric shows `237 ml flour`, switch back
  restores `1 cup flour`, region-unknown keeps the cup original.

**Test run (after review hardening + main merge):**
```
unit: measurement-region, ingredient-amount (bridge), instruction-temp (temp
  expression parser: single/range/dual paren+slash+or/no-degree/gas guard),
  scale (range endpoints), measurements/target-units (US lb/cup selection)
component: measurement-toggle, ingredients-section
integration (CookSections/MethodSteps): method-only selector, temp-range
  conversion, drawer preparation preservation, Original range scaling,
  repeated portion+system switching, live-region updates
full repo: 523 passed (53 files); tsc --noEmit → 0; eslint src → clean
next build → success
```

**Attack vectors (falsify):** missing quantity, unknown/ambiguous unit,
region-unknown region-sensitive unit, unresolvable gas mark, no-temperature
instruction, legacy row (null structured fields), range conversion — each has a
committed test asserting safe fallback / correct output.

**Bugs raised:** none. Real-app visual verification available on the Vercel
preview deploy for the branch.
