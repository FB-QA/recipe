/**
 * Unit normaliser — free-text unit → canonical code with a confidence value.
 * Never guesses on genuine ambiguity (the classic `t` teaspoon / `T`
 * tablespoon trap); returns `unknown` rather than throwing on nonsense.
 * Spec: docs/spec/measurement-conversion.md §16.
 */

import type { MeasurementUnit, NormalizedUnitResult } from "./measurement-types";
import { UNIT_DEFINITIONS } from "./unit-definitions";

/** Single letters that are inherently ambiguous — handled before the alias map. */
const AMBIGUOUS_TOKENS: Record<string, { candidates: MeasurementUnit[]; confidence: number }> = {
  t: { candidates: ["tsp", "tbsp"], confidence: 0.4 },
  c: { candidates: ["cup", "celsius"], confidence: 0.4 },
  C: { candidates: ["celsius", "cup"], confidence: 0.4 },
};

/** Multi-letter tokens that map to two units — checked on the canonical key. */
const AMBIGUOUS_KEYS: Record<string, { candidates: MeasurementUnit[]; confidence: number }> = {
  // "gm" is grams to most, gas mark to some — surface it, don't silently pick.
  gm: { candidates: ["g", "gas_mark"], confidence: 0.5 },
};

/** Case-sensitive shorthand where case carries the meaning. */
const CASED_TOKENS: Record<string, { unit: MeasurementUnit; confidence: number }> = {
  T: { unit: "tbsp", confidence: 0.7 },
};

/**
 * Fold a token to a comparable key: NFKC (folds fullwidth/compatibility forms
 * like `ｇ` and the fullwidth stop `．`), lower-case, unify Unicode hyphens/
 * dashes to spaces, drop dots, and collapse whitespace (JS `\s` already covers
 * NBSP and the other Unicode spaces). So `fl‑oz` and `tbsp．` normalise cleanly.
 */
function canonicalize(text: string): string {
  return text
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[-‐-―−]/g, " ") // ASCII + Unicode hyphen/dash variants → space
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** alias key → canonical unit. Single ambiguous letters are excluded on purpose. */
const ALIAS_MAP: Record<string, MeasurementUnit> = (() => {
  const map: Record<string, MeasurementUnit> = {};
  // Only `c` (cup/celsius) and `t` (tsp/tbsp) are genuinely ambiguous and are
  // handled explicitly below. `f` is not ambiguous with any other unit, so it
  // maps straight to fahrenheit via its alias.
  const skip = new Set(["c", "t"]);
  for (const def of Object.values(UNIT_DEFINITIONS)) {
    for (const alias of [def.id, ...def.aliases]) {
      const key = canonicalize(alias);
      if (!key || skip.has(key) || key in AMBIGUOUS_KEYS) continue;
      // First writer wins; definitions are ordered weight→volume→… so a
      // collision (there are none today) would favour the earlier dimension.
      if (!(key in map)) map[key] = def.id;
    }
  }
  return map;
})();

export function normalizeUnit(input: string): NormalizedUnitResult {
  const original = input ?? "";
  const trimmed = original.trim();

  if (!trimmed) {
    return { unit: "unknown", confidence: 0, originalText: original };
  }

  if (trimmed in CASED_TOKENS) {
    const hit = CASED_TOKENS[trimmed];
    return { unit: hit.unit, confidence: hit.confidence, originalText: original };
  }

  if (trimmed in AMBIGUOUS_TOKENS) {
    const hit = AMBIGUOUS_TOKENS[trimmed];
    return {
      unit: hit.candidates[0],
      confidence: hit.confidence,
      originalText: original,
      ambiguous: true,
      candidates: hit.candidates,
    };
  }

  const key = canonicalize(trimmed);

  if (key in AMBIGUOUS_KEYS) {
    const hit = AMBIGUOUS_KEYS[key];
    return {
      unit: hit.candidates[0],
      confidence: hit.confidence,
      originalText: original,
      ambiguous: true,
      candidates: hit.candidates,
    };
  }

  const unit = ALIAS_MAP[key];
  if (unit) {
    return { unit, confidence: 1, originalText: original };
  }

  return { unit: "unknown", confidence: 0, originalText: original };
}
