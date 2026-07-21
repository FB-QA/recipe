/**
 * Quantity parser — recipe quantity text → structured value(s) + modifiers.
 * Handles wholes, decimals, unicode & typed fractions, mixed numbers, ranges
 * and approximate/modifier words. Never discards a modifier; never throws.
 * Spec: docs/spec/measurement-conversion.md §15.
 */

import type { ParsedQuantity, QuantityModifier } from "./measurement-types";

const MODIFIERS: QuantityModifier[] = [
  "about",
  "approximately",
  "roughly",
  "generous",
  "heaped",
  "rounded",
  "level",
  "scant",
];

/** Unicode vulgar fractions → decimal value. */
const UNICODE_FRACTIONS: Record<string, number> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
  "⅕": 0.2,
  "⅖": 0.4,
  "⅗": 0.6,
  "⅘": 0.8,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅐": 1 / 7,
  "⅑": 1 / 9,
  "⅒": 0.1,
};

/** Replace each unicode fraction with a space-separated decimal ("1½" → "1 0.5"). */
function expandUnicodeFractions(text: string): string {
  let out = text;
  for (const [glyph, value] of Object.entries(UNICODE_FRACTIONS)) {
    out = out.split(glyph).join(` ${value} `);
  }
  return out;
}

/**
 * Evaluate a purely-numeric expression (mixed number / fraction / decimal /
 * whole) by summing its tokens. Returns null if any token is non-numeric.
 */
function evalNumeric(expr: string): number | null {
  const cleaned = expandUnicodeFractions(expr).trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  let sum = 0;
  let any = false;
  for (const tok of tokens) {
    const frac = /^(\d+)\/(\d+)$/.exec(tok);
    if (frac) {
      const denom = Number(frac[2]);
      if (denom === 0) return null;
      sum += Number(frac[1]) / denom;
      any = true;
      continue;
    }
    if (/^\d*\.?\d+$/.test(tok)) {
      sum += Number(tok);
      any = true;
      continue;
    }
    return null; // a non-numeric token means this isn't a pure quantity
  }
  return any ? sum : null;
}

export function parseQuantity(input: string): ParsedQuantity {
  const raw = (input ?? "").trim();
  const empty: ParsedQuantity = { value: null, max: null, text: raw || null, isRange: false, modifiers: [], confidence: 0.1 };
  if (!raw) return empty;

  const lower = raw.toLowerCase();
  const modifiers = MODIFIERS.filter((m) => new RegExp(`\\b${m}\\b`).test(lower));
  const leadingArticle = /^(a|an)\b/.test(lower) && !/^\s*[\d¼½¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚⅐⅑⅒]/.test(lower);

  // Normalise a numeric "X to Y" into "X-Y", then strip every letter so only
  // numeric tokens, fraction slashes and range separators remain.
  const deworded = lower
    .replace(/(\d)\s+to\s+(\d)/g, "$1-$2")
    .replace(/[a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Range?  two numeric parts separated by a dash/en-dash/em-dash.
  const parts = deworded.split(/\s*[–—-]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2) {
    const lo = evalNumeric(parts[0]);
    const hi = evalNumeric(parts[1]);
    if (lo !== null && hi !== null) {
      if (lo <= hi) {
        return { value: lo, max: hi, text: raw, isRange: true, modifiers, confidence: 0.9 };
      }
      // Inverted range — do not silently swap; report low confidence.
      return { value: lo, max: null, text: raw, isRange: false, modifiers, confidence: 0.3 };
    }
  }

  const value = evalNumeric(deworded);
  if (value !== null) {
    return { value, max: null, text: raw, isRange: false, modifiers, confidence: 0.95 };
  }

  if (leadingArticle) {
    return { value: 1, max: null, text: raw, isRange: false, modifiers, confidence: 0.7 };
  }

  return { value: null, max: null, text: raw, isRange: false, modifiers, confidence: 0.2 };
}
