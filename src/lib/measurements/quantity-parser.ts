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

/** Every recognised fraction glyph, as a string for use inside a regex class. */
export const UNICODE_FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join("");

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
  const nums: number[] = [];
  for (const tok of tokens) {
    const frac = /^(\d+)\/(\d+)$/.exec(tok);
    if (frac) {
      const denom = Number(frac[2]);
      if (denom === 0) return null;
      nums.push(Number(frac[1]) / denom);
      continue;
    }
    if (/^\d*\.?\d+$/.test(tok)) {
      nums.push(Number(tok));
      continue;
    }
    return null; // a non-numeric token means this isn't a pure quantity
  }
  if (nums.length === 0) return null;
  if (nums.length === 1) return nums[0];
  // A mixed number is a leading value followed by fractional parts (each < 1).
  // Two whole numbers side by side (e.g. "2 400" from "2 x 400g cans") is a
  // compound quantity, not a mixed number — never fabricate a sum from it.
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] >= 1) return null;
  }
  return nums.reduce((a, b) => a + b, 0);
}

export function parseQuantity(input: string): ParsedQuantity {
  const raw = (input ?? "").trim();
  const empty: ParsedQuantity = { value: null, max: null, text: raw || null, isRange: false, modifiers: [], confidence: 0.1 };
  if (!raw) return empty;

  const lower = raw.toLowerCase();
  const modifiers = MODIFIERS.filter((m) => new RegExp(`\\b${m}\\b`).test(lower));
  const leadingArticle = /^(a|an)\b/.test(lower) && !/^\s*[\d¼½¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚⅐⅑⅒]/.test(lower);

  // Expand unicode fractions FIRST so a fraction endpoint ("½ to 1") is seen by
  // the range detector, then normalise a numeric "X to Y" into "X-Y" and strip
  // every letter so only numeric tokens, slashes and range separators remain.
  const deworded = expandUnicodeFractions(lower)
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
    // "a 400g can": a leading article denotes one unit, and an embedded WHOLE
    // number is package-size noise, not the quantity — the article wins. A
    // fractional value ("a 1/2 cup") is a genuine quantity and stands.
    if (leadingArticle && Number.isInteger(value)) {
      return { value: 1, max: null, text: raw, isRange: false, modifiers, confidence: 0.6 };
    }
    return { value, max: null, text: raw, isRange: false, modifiers, confidence: 0.95 };
  }

  if (leadingArticle) {
    return { value: 1, max: null, text: raw, isRange: false, modifiers, confidence: 0.7 };
  }

  return { value: null, max: null, text: raw, isRange: false, modifiers, confidence: 0.2 };
}
