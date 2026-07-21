/**
 * Quantity formatter — turn full-precision values into cook-friendly display:
 * friendly fractions and friendly unit selection. Formatting reads the source
 * value; it never rounds a rounded value.
 * Spec: docs/spec/measurement-conversion.md §27, §28.
 */

import type { MeasurementUnit } from "./measurement-types";

/** Decimal → glyph, ordered; thirds included alongside halves/quarters/eighths. */
const FRACTION_GLYPHS: { value: number; glyph: string }[] = [
  { value: 1 / 8, glyph: "⅛" },
  { value: 1 / 4, glyph: "¼" },
  { value: 1 / 3, glyph: "⅓" },
  { value: 3 / 8, glyph: "⅜" },
  { value: 1 / 2, glyph: "½" },
  { value: 5 / 8, glyph: "⅝" },
  { value: 2 / 3, glyph: "⅔" },
  { value: 3 / 4, glyph: "¾" },
  { value: 7 / 8, glyph: "⅞" },
];

// Snap targets for the fractional part: a whole (0), each glyph, or the next
// whole (1). "" means no glyph — round to the whole number.
const SNAP_TARGETS: { value: number; glyph: string }[] = [
  { value: 0, glyph: "" },
  ...FRACTION_GLYPHS,
  { value: 1, glyph: "" },
];

/**
 * Format a value as "1½", "¼", "7", or a plain decimal. Snaps to the nearest
 * friendly value (a whole or a familiar fraction) ONLY when that doesn't
 * materially change the quantity — the tolerance is relative to the WHOLE value
 * (§28). So 7.0548 oz → "7" (a 0.7% nudge), but 0.2029 tsp does NOT become "¼"
 * (a 23% overstatement) and falls back to a decimal.
 */
export function formatQuantityValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs < 1e-9) return "0";
  const whole = Math.floor(abs + 1e-9);
  const frac = abs - whole;

  let best = SNAP_TARGETS[0];
  let bestDist = Infinity;
  for (const t of SNAP_TARGETS) {
    const d = Math.abs(frac - t.value);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  // Relative tolerance (with a small absolute floor for tiny values).
  if (bestDist <= Math.max(0.02, 0.04 * abs)) {
    const w = best.value === 1 ? whole + 1 : whole;
    // Never snap a genuinely nonzero value down to a bare "0" — that erases a
    // real (if small) quantity. Fall through to a significant-figure decimal.
    if (!(w === 0 && !best.glyph)) {
      if (best.glyph) return w > 0 ? `${sign}${w}${best.glyph}` : `${sign}${best.glyph}`;
      return `${sign}${w}`;
    }
  }
  // Two significant figures keeps sub-1 values readable without collapsing to 0
  // (0.01 stays "0.01"); toFixed(2) alone would round 0.01 → "0.00".
  const decimal = abs >= 1 ? Number(abs.toFixed(2)) : Number(abs.toPrecision(2));
  return `${sign}${decimal}`;
}

/**
 * Choose a friendly mass unit for a value in grams. Selection only — the value
 * is converted to the chosen unit but NOT rounded here (rounding sub-milligram
 * masses to zero would drop a real quantity); callers round for display.
 */
export function selectFriendlyMass(grams: number): { value: number; unit: MeasurementUnit } {
  if (grams < 1) return { value: grams * 1000, unit: "mg" };
  if (grams >= 1000) return { value: grams / 1000, unit: "kg" };
  return { value: grams, unit: "g" };
}

/** Choose a friendly volume unit for a value in millilitres. */
export function selectFriendlyVolume(ml: number): { value: number; unit: MeasurementUnit } {
  if (ml >= 1000) return { value: ml / 1000, unit: "l" };
  return { value: ml, unit: "ml" };
}

