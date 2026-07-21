---
slug: measurement-conversion-foundation
project: recipe
type: user-story
created: 2026-07-21
status: ready-for-qa
shape: compute
links: [spec/measurement-conversion.md]
qa-skip: pure library, no UI surface — verify + falsify both run at the unit layer in this story
---

# Measurement conversion foundation — the deterministic engine

## Story  (Tara)

As a **Cookdex cook**, I want **the app to convert a recipe's quantities,
temperatures and dimensions between measurement systems accurately and
deterministically**, so that **later stories can put a toggle on the recipe
and I can read any recipe in the units I think in — without the recipe's
data ever changing**.

This is Phase 1 of the measurement system: a pure library under
`src/lib/measurements/`. **No UI, no database, no data dependencies.** It is
the keystone every later phase sits on. Contract:
`docs/spec/measurement-conversion.md` (canonical model, exact constants,
formatting and confidence rules). Built solo by Tara at Freddi's direction.

### Acceptance criteria

- **AC1 — Unit normalisation.** Free-text unit strings resolve to canonical
  unit codes with a confidence value: `grams|gram|g → g`, `kilograms → kg`,
  `lbs → lb`, `ounces → oz`, `tablespoons|tbsp. → tbsp`, `millilitres → ml`,
  `fl oz → fl_oz`. Trimming, unicode-punctuation and trailing-dot handling
  apply. Genuinely ambiguous input (`t` teaspoon vs `T` tablespoon) returns
  an ambiguous/low-confidence result — never a silent guess. Unrecognised
  input returns `unknown`, not an error.
- **AC2 — Quantity parsing.** Parses whole (`2`), decimal (`1.5`), unicode
  fractions (`½ ¼ ¾ ⅓ ⅔ ⅛`), typed fractions (`1/2`), mixed numbers
  (`1 1/2`, `1½`), ranges (`2–3`, `2 to 3` → `{value, max}`), and approximate
  forms (`about 2`, `a heaped teaspoon`) — capturing modifiers
  (`about|approximately|roughly|generous|heaped|rounded|level|scant`) without
  discarding them. Unparseable input returns a low-confidence result, not a
  throw.
- **AC3 — Exact weight conversion.** `1000 g → 1 kg`, `1 kg → 1000 g`,
  `1 oz → 28.349523125 g`, `1 lb → 453.59237 g`, `16 oz → 1 lb`. Full
  precision internally; confidence `exact`, `approximate: false`.
- **AC4 — Regional volume conversion.** Respects profiles: `1 metric cup →
  250 ml`, `1 US cup → 236.5882365 ml`, `1 US fl oz → 29.5735295625 ml`,
  `1 imperial fl oz → 28.4130625 ml`, `1 US pint → 473.176473 ml`,
  `1 imperial pint → 568.26125 ml`, `1 Australian tbsp → 20 ml`. The same
  unit name in two regions yields two different millilitre values.
- **AC5 — Temperature conversion.** `32°F → 0°C`, `212°F → 100°C`,
  `180°C → 356°F` (pre-display-rounding), gas mark via lookup
  (`Gas 4 → 180°C`, `Gas 6 → 200°C`). Display rounding to nearest 5° is
  available but does not corrupt the internal value.
- **AC6 — Length/dimension conversion.** `1 inch → 25.4 mm`,
  `20 cm → 8-inch` practical tin equivalent, `5 mm → ¼ inch`. Single and
  multi-dimension (`20 × 30 cm`) supported.
- **AC7 — Dimension safety.** Cross-dimension conversions
  (`g → cm`, `cup → °C`) and volume↔weight without a density profile return
  a typed error/`unavailable` result — never a fabricated number. The
  library never invents a conversion.
- **AC8 — Friendly formatting.** Full-precision values format for display:
  friendly fractions (`0.25 → ¼`, `1.5 → 1½`), friendly unit selection
  (`0.003 kg → 3 g`, `1500 ml → 1.5 L`), and the spec's display-rounding
  bands. Ranges format both ends. Formatting reads the original/source value,
  never a previously-rounded one — no accumulated drift across repeated
  format calls.

### Surfaces

- none — pure library. Public API exported from `src/lib/measurements/index.ts`.

### Modules (spec §33, adapted to repo `src/lib/` convention)

- `measurement-types.ts` — dimensions, units, regions, confidence, result +
  request contracts
- `unit-definitions.ts` — per-unit definition (dimension, labels, aliases,
  canonical multiplier, regional definitions)
- `regional-profiles.ts` — metric / us / uk_ie / australia volume + spoon values
- `unit-normalizer.ts` — free text → canonical + confidence + ambiguity
- `quantity-parser.ts` — all quantity formats + modifiers + ranges
- `quantity-formatter.ts` — friendly fractions, unit selection, rounding bands
- `measurement-converter.ts` — weight/volume/temp/length + gas-mark lookup +
  dimension guards
- `index.ts` — public `MeasurementConversionService`-shaped API
- `measurement.test.ts` (+ per-module tests) — the §43 matrix

### Out of scope (later phases)

- Any UI, toggle, or recipe integration (Phase 2)
- Ingredient-specific volume↔weight / density profiles (Phase 3)
- Legacy row parsing / convert-on-read status model (Phase 4)
- Instruction span parsing (Phase 5)
- Preferences, overrides, persistence (Phase 6)

### Edge cases

- Empty / whitespace / null quantity or unit → low-confidence/`unknown`, no throw.
- Oversized or nonsense unit string → `unknown`, confidence 0.
- Range where min > max → treated as unparseable range, not a silent swap.
- Zero and negative quantities → parsed as given; converter does not reject
  legitimate zero, but negative flagged `INVALID_QUANTITY`.
- `t`/`T` and `c` ambiguity → ambiguous result surfaced, caller decides.

## Verification  (test-first, §43 matrix)

- **Unit tests:** the full §43 matrix — normalisation, parsing, weight,
  regional volume, temperature, length, dimension-safety, formatting. Written
  before implementation, red then green.
- **Integration tests:** none — no server contract, no endpoint, no DB in
  this story (pure library).
- **Visual contract:** none — no surface.
- **E2E:** none — no journey.

**Test run:**

```
# verify — src/lib/measurements/measurement.test.ts
 ✓ src/lib/measurements/measurement.test.ts (76 tests) 6ms
 Test Files  1 passed (1)   Tests  76 passed (76)

# verify + falsify — src/lib/measurements/
 ✓ measurement.falsify.test.ts (13 tests)
 ✓ measurement.test.ts (76 tests)
 Test Files  2 passed (2)   Tests  89 passed (89)

# full repo regression
 Test Files  36 passed (36)   Tests  373 passed (373)

# tsc --noEmit → exit 0    # eslint src/lib/measurements/ → clean
```

Integration / visual / E2E: none — pure library, no server contract or surface
(declared above). Verified red → green: the suite failed on missing modules
before implementation, passed after.

**Attack vectors (falsify):** malformed/non-finite/negative quantities;
boundary & out-of-range lookups (gas mark 11, 1e9 kg, zero); round-trip drift
(cup→ml→cup, repeated display rounding); injection-ish/junk parser input;
locale traps (comma decimals, unicode-fraction ranges, casing/whitespace). 13
repros committed in `measurement.falsify.test.ts`, all green.

**Bugs raised:**
1. **Comma-decimals not interpreted** (`"1,5"` ≠ 1.5). *Not a defect —
   deliberate.* A comma is ambiguous with a thousands separator, so the parser
   returns a safe low-confidence result rather than fabricate a value
   (principle 5, "never invent"). Captured as a committed repro and flagged for
   the Phase 4 parser-hardening story if real imports show comma-decimal
   quantities.

## QA verdict  (Priya hat — independent pass, all agent duties performed solo)

Read cold, not derived from the verify/falsify suites. Regressions in
`measurement.qa.test.ts` (7 tests).

**Defect found and fixed — negative temperatures rejected.** `convert()` gated
`quantity < 0` for every dimension, so a `−18°C` freezer / `−40°F` chill
instruction returned `INVALID_QUANTITY` instead of converting. The verify pass
only tested oven temperatures, so the gap was invisible. Fix: negatives allowed
for `temperature` only; still rejected for weight/volume/length; non-finite
still rejected everywhere. Range-max guard fixed to match.

| AC | Verdict |
|----|---------|
| AC1 unit normalisation | PASS |
| AC2 quantity parsing | PASS |
| AC3 exact weight | PASS |
| AC4 regional volume | PASS |
| AC5 temperature | PASS *(after negative-temp fix)* |
| AC6 length / dimensions | PASS |
| AC7 dimension safety | PASS |
| AC8 friendly formatting | PASS |

**Final (pre-review):** 96 tests, tsc + lint clean, full repo suite green.

## PR #21 review response (Codex + Claude automated review)

Triaged 9 findings. **6 fixed, 2 rejected with reasoning, 1 already fixed.**
Regressions in `measurement.review.test.ts` (15 tests). Suite now **111**
(76 verify + 13 falsify + 7 QA + 15 review); full repo 395; tsc + lint clean.

Fixed:
- **C2 (P1)** compound quantities — `"2 x 400g cans"` summed to `402`. Parser
  now only treats `int + fractional-parts` as a mixed number; two whole numbers
  side-by-side yield null, never a fabricated sum.
- **C1 (P1)** out-of-table gas marks — `Gas 11`/`Gas 4.5` snapped to a real
  setting and claimed `exact`. Gas mark *as source* is now exact-table-only →
  unavailable otherwise. (Gas mark as *target* keeps nearest-lookup, marked
  approximate — mapping a continuous temp onto the discrete scale is valid.)
- **CL2** bare `f`/`F` → `unknown`; was an unintended entry in the alias skip
  set. Now maps to fahrenheit (`f` isn't ambiguous with anything).
- **C6** `targetSystem: "original"` returned an error; now an identity
  passthrough so the toggle's Original position works.
- **C3** `allowApproximate` was ignored; `convert` now refuses an approximate
  result when a caller sets `allowApproximate: false`.
- **C4** multi-dimension (`20 × 30 cm`) — was against my own AC6 and unmet.
  Added `parseDimensions`; each value converts through the scalar converter.

Rejected (documented in the review test file):
- **C5** "negative sign preserved" — `parseQuantity("-5")` already returns
  `null` (verified), not `5`. It does not fabricate. False positive.
- **CL3** `friendlyFraction` tolerance — no absolute tolerance separates the
  spec's wanted `5mm → ¼` (gap 0.053) from the unwanted `50ml-in-cups → ¼`
  (gap 0.039); the value to reject is the *closer* one. It's a display-context
  problem (don't render small volumes as cup-fractions) for Phase 2, not a
  primitive-tolerance bug. Primitive kept.

Already fixed before review landed: **CL1** negative temperatures (my QA pass,
commit 2b68274 — Codex/Claude reviewed the earlier c1ed190).

**Final:** foundation sound, independently reviewed, all confirmed findings
resolved.
