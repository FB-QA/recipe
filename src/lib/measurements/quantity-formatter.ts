/**
 * Quantity formatter — turn full-precision values into cook-friendly display:
 * friendly fractions, friendly unit selection, and the spec's display-rounding
 * bands. Formatting reads the source value; it never rounds a rounded value.
 * Spec: docs/spec/measurement-conversion.md §27, §28.
 */

import type { MeasurementDimension, MeasurementUnit } from "./measurement-types";

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

/**
 * Nearest friendly fraction glyph for a 0..1 value, or "" if none is close
 * ENOUGH. The tolerance is RELATIVE to the glyph (with a small absolute floor),
 * so a snap never materially changes the quantity (§28): 0.5 → ½, but 0.2029
 * (1 ml as US tsp) does NOT snap to ¼ — a 23% overstatement — and falls back to
 * a decimal instead.
 */
export function friendlyFraction(fraction: number, tolerance = 0.08): string {
  let best = "";
  let bestDist = Infinity;
  for (const f of FRACTION_GLYPHS) {
    const dist = Math.abs(fraction - f.value);
    const allowed = Math.max(0.02, tolerance * f.value);
    if (dist <= allowed && dist < bestDist) {
      best = f.glyph;
      bestDist = dist;
    }
  }
  return best;
}

/** Format a value as "1½", "¼", "3", or a plain decimal when no fraction fits. */
export function formatQuantityValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const whole = Math.floor(abs + 1e-9);
  const frac = abs - whole;

  const glyph = frac > 1e-9 ? friendlyFraction(frac) : "";
  if (glyph) {
    return whole > 0 ? `${sign}${whole}${glyph}` : `${sign}${glyph}`;
  }
  if (frac <= 1e-9) return `${sign}${whole}`;
  // No friendly fraction fits — fall back to a trimmed decimal.
  return `${sign}${Number(abs.toFixed(2))}`;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Choose a friendly mass unit for a value in grams. Selection only — the value
 * is converted to the chosen unit but NOT rounded here (rounding sub-milligram
 * masses to zero would drop a real quantity); callers apply roundForDisplay.
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

/** Apply the spec's display-rounding band for a dimension. Idempotent. */
export function roundForDisplay(value: number, dimension: MeasurementDimension): number {
  const abs = Math.abs(value);
  if (dimension === "weight") {
    if (abs < 10) return roundTo(value, 0.5);
    if (abs < 100) return roundTo(value, 1);
    if (abs < 1000) return roundTo(value, 5);
    return roundTo(value, 50); // 0.05 kg
  }
  if (dimension === "volume") {
    if (abs < 10) return roundTo(value, 0.5);
    if (abs < 100) return roundTo(value, 1);
    if (abs < 1000) return roundTo(value, 5);
    return roundTo(value, 50); // 0.05 L
  }
  if (dimension === "temperature") return roundTo(value, 5);
  return Number(value.toFixed(2));
}

/** Common round tin sizes, in inches. */
const COMMON_TIN_INCHES = [6, 7, 8, 9, 10, 11, 12];

/** Nearest practical whole-inch tin size for a length in millimetres. */
export function practicalTinInches(mm: number): number {
  const inches = mm / 25.4;
  return COMMON_TIN_INCHES.reduce((best, cur) =>
    Math.abs(cur - inches) < Math.abs(best - inches) ? cur : best,
  );
}
