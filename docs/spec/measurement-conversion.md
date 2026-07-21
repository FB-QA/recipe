---
slug: measurement-conversion
project: recipe
type: spec
created: 2026-07-21
status: active
---

# Measurement units & conversion

> **Save it. Cook it.** — let a cook view any recipe's quantities in the
> measurement system they think in, without ever altering the recipe.

This spec is the durable contract for Cookdex's measurement system. The
source brief (Freddi, 2026-07-21) ran 46 sections; this is the shaped,
scoped version we are building. Where a section number is cited (e.g. §17)
it refers to that source brief.

---

## The user need

An Irish cook opens an American recipe: cups, ounces, Fahrenheit, an
8-inch tin. Today they do the sums in their head or give up. Cookdex should
show that recipe in metric — grams, millilitres, Celsius, a 20 cm tin — at
the tap of a toggle, and flip back to the exact original just as fast. The
recipe's stored data never changes; only the display does.

## Mandatory principles (non-negotiable)

1. **Preserve the original.** Converted values are display-only. The stored
   recipe is never overwritten.
2. **Full precision internally, round only for display.**
3. **No universal cups-to-grams.** Volume↔weight needs ingredient-specific
   density. One formula for all ingredients is wrong.
4. **Respect regional differences.** A US cup ≠ a metric cup.
5. **Never invent a conversion.** No trusted data → show the original and
   say a reliable conversion isn't available.
6. **Deterministic code, not AI, does the maths.** The AI extractor
   structures data; it never calculates conversions on toggle.
7. **Calculate scaled and converted values from the original quantity** —
   never from an already-rounded or already-converted display value. This
   is what prevents accumulated rounding drift.
8. **Fail safely** — one bad ingredient falls back to its original text;
   the rest of the recipe still converts and the toggle stays usable.
9. **Never require login** to change measurements.

---

## Scope decisions (Tara + Freddi, 2026-07-21)

The full brief is a programme of work, not a feature. Shaped into six
phases. **The core toggle must not depend on the density corpus, the legacy
backfill, or instruction annotation.**

| Phase | What | Data deps | UI |
|---|---|---|---|
| **1 — Conversion foundation** | Types, unit model, regional profiles, unit normaliser, quantity parser, quantity formatter, exact converter (weight/volume/temp/length) | none | none — pure library |
| **2 — Recipe toggle + portion** | Controls bar, selector, original preservation, portion-scaling from source (incl. range endpoints), no-reload update, a11y, **display-time oven-temperature conversion in method text** (`350°F`/`180°C`/`Gas Mark 4`, single/range/dual-scale) | none new | native `<select>` (design supplied by Freddi) |
| **3 — Seed density dataset** | `ingredient_conversion_profiles`, ~25 curated verified staples, cup↔gram where data exists | new table | approximation indicators |
| **4 — Legacy parsing** | Per-ingredient convert-on-read status model, lazy parse of null-quantity rows, session cache | none | per-ingredient status |
| **5 — Instruction conversion (remainder)** | Tin/length dimensions in text; PERSISTED character-span annotations + extractor change. (Deterministic oven-**temperature** parsing already shipped in Phase 2, display-time only, no stored spans.) | later table | span substitution |
| **6 — Overrides + polish** | Individual ingredient conversion, per-recipe + ingredient persistence, optimistic save, logged-out session, perf | 3 tables (§36) | overrides UI |

**Density (§17):** seed a small verified set (~25 baking staples), prep-state
where it materially matters (packed brown sugar, sifted flour, grated
cheese). Each record documented source + approximation status. Outside the
set: do not guess — "reliable weight conversion unavailable."

**Legacy rows:** convert-on-read, no bulk backfill for now. Normalise unit
and parse quantity in memory at display time. Parser/normaliser built so a
future controlled backfill (dry-run, thresholds, idempotent, rollback) can
reuse the same deterministic logic. Never write guessed values back.

---

## Current codebase reality (verified 2026-07-21)

- `recipe_ingredients` already has `quantity_value`, `quantity_min`,
  `quantity_max` (numeric), `preparation`, `optional`. The v2 importer
  populates them.
- **`unit` is free text** (60 chars) — "cups", "cup", "c", "tbsp." all land
  raw. There is **no normaliser anywhere**. Canonical unit codes do not
  exist yet. This is Phase 1's keystone.
- No `measurementRegion`, no persisted parse confidence.
- **No density data of any kind.** No canonical-ingredient table.
- Steps are `instruction` text + optional `title`. **No measurement spans**;
  the extractor emits none. Temperatures/tins live only in free-text steps.

---

## Canonical model

**Dimensions:** `weight | volume | temperature | length | count | informal | unknown`.

Safe conversions: same-dimension only, except volume↔weight which requires
an ingredient density profile. Never cross unrelated dimensions
(grams→cm, cups→°C are errors).

**Canonical internal units:** weight → **grams**; volume → **millilitres**;
length → **millimetres**; temperature has no single canonical (formula-based).

### Weight (exact)

```
1 kg = 1000 g
1 oz = 28.349523125 g
1 lb = 453.59237 g   (= 16 oz)
```

### Volume — regional profiles

| Unit | Metric | US | UK/IE |
|---|---|---|---|
| teaspoon | 5 ml | 4.92892159375 ml | 5 ml |
| tablespoon | 15 ml | 14.78676478125 ml | 15 ml |
| cup | 250 ml | 236.5882365 ml | 250 ml |
| fluid ounce | — | 29.5735295625 ml | 28.4130625 ml (imperial) |
| pint | — | 473.176473 ml | 568.26125 ml (imperial) |
| quart | — | 946.352946 ml | — |
| gallon | — | 3785.411784 ml | 4546.09 ml (imperial) |
| litre | 1000 ml | 1000 ml | 1000 ml |
| millilitre | 1 ml | 1 ml | 1 ml |

Australia (architecture-only in V1, not a user-facing preference):
tablespoon = 20 ml, cup = 250 ml.

### Temperature

```
C = (F - 32) × 5/9      F = C × 9/5 + 32
```

Display rounding: nearest 5°C / nearest 5°F. Gas mark via **lookup table**,
never a formula:

| Gas | °C | °F | | Gas | °C | °F |
|--:|--:|--:|---|--:|--:|--:|
| ¼ | 110 | 225 | | 5 | 190 | 375 |
| ½ | 120 | 250 | | 6 | 200 | 400 |
| 1 | 140 | 275 | | 7 | 220 | 425 |
| 2 | 150 | 300 | | 8 | 230 | 450 |
| 3 | 170 | 325 | | 9 | 240 | 475 |
| 4 | 180 | 350 | | | | |

No conventional↔fan conversion in V1 (that's a cooking-instruction feature,
not measurement).

### Length (exact)

```
1 inch = 25.4 mm     1 cm = 10 mm     1 m = 1000 mm
```

Display practical tin equivalents (20 cm → 8-inch, 23 cm → 9-inch,
5 mm → ¼ inch), not 7.874-inch precision.

---

## Formatting

- Friendly fractions: 0.125→⅛, 0.25→¼, ⅓, 0.5→½, ⅔, 0.75→¾; mixed 1.5→1½.
- Friendly unit selection: `3 g salt` not `0.003 kg`; `1.5 L` not `1500 ml`.
  - Weight: <1 g → mg where apt; 1–999 g → g; ≥1000 g → kg.
  - Volume: <1000 ml → ml; ≥1000 ml → L.
- Display rounding (approximate conversions):
  - Weight: <10 g →0.5 g; 10–100 g →1 g; 100–1000 g →5 g; >1 kg →0.05 kg.
  - Volume: <10 ml →0.5 ml; 10–100 ml →1 ml; 100–1000 ml →5 ml; >1 L →0.05 L.
  - US spoons/cups: snap to familiar fractions when close, never if it
    materially changes the quantity.

---

## Confidence & result contract

```
ConversionConfidence = exact | high | medium | low | unavailable
```

Every conversion returns original + converted quantity (and max, for ranges,
converted independently), the confidence, an `approximate` flag, and an
optional warning/explanation. Approximate conversions must be labelled with
accessible text ("Approximate"), never colour alone. The original value is
always reachable.

---

## Out of scope for V1

Nutritional recalculation, fan-oven conversion, altitude/pressure/microwave
adjustments, ingredient substitution, automatic pan-volume/cooking-time
changes, user-submitted global density, full auto handful/piece→weight,
lab-precision mode, Australian user-facing preference. Architecture must
allow these later.
