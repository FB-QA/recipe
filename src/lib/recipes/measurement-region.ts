import type { MeasurementRegion } from "@/lib/measurements";

/**
 * Minimal, strong-signal-only source-region detection for Phase 2. This is NOT
 * the full confidence-scored `RecipeMeasurementMetadata` (that's Phase 3, §9) —
 * it asserts a region only on an unambiguous deterministic cue and returns
 * `undefined` otherwise, so region-sensitive units (cup, pint, US spoons) are
 * converted only when we genuinely know the region and preserved as original
 * when we don't. Never guesses.
 */
export interface SourceRegionSignals {
  /** Ingredient unit strings (raw, as stored). */
  units: (string | null | undefined)[];
  /** Instruction / step text, where oven temps and pints usually appear. */
  instructions: (string | null | undefined)[];
}

export function detectSourceRegion(signals: SourceRegionSignals): MeasurementRegion | undefined {
  const text = (signals.instructions ?? [])
    .filter((s): s is string => Boolean(s))
    .join(" \n ")
    .toLowerCase();
  const units = (signals.units ?? [])
    .filter((u): u is string => Boolean(u))
    .map((u) => u.toLowerCase().trim());

  const hasFahrenheit = /\d\s*°?\s*f\b/.test(text) || /°f/.test(text) || /fahrenheit/.test(text);
  const hasCelsius = /\d\s*°?\s*c\b/.test(text) || /°c/.test(text) || /celsius/.test(text);
  // A BARE "pint" is ambiguous (US 473 ml vs UK/IE 568 ml), so it is not a
  // signal. Only an explicitly "imperial pint" is a strong UK/IE cue.
  const hasImperialPint = /\bimperial\s+pints?\b/.test(text);
  // Gas marks are a British/Irish oven convention — a strong UK/IE cue.
  const hasGasMark = /\bgas\s*mark\b/.test(text) || units.some((u) => u === "gas_mark");
  // Explicit regional qualifiers on a unit ("1 US cup", "metric cup").
  const hasUsQualifier = /\bus\s+(?:cups?|pints?|fl\.?\s*oz|fluid\s+ounces?|tbsps?|tablespoons?|tsps?|teaspoons?|gallons?|quarts?)\b|\bus\s+customary\b/.test(text);
  const hasMetricQualifier = /\bmetric\s+(?:cups?|tbsps?|tablespoons?|tsps?|teaspoons?)\b/.test(text);
  const hasMetricWeight =
    units.some((u) => ["g", "kg", "gram", "grams", "kilogram", "kilograms"].includes(u)) ||
    /\d\s*g\b|\bgrams?\b/.test(text);

  // Collapse to the distinct region cues; more than one distinct cue → we can't
  // tell, so don't guess (leave region-sensitive units unchanged).
  const usCue = hasFahrenheit || hasUsQualifier;
  const ukCue = hasImperialPint || hasGasMark;
  const metricCue = hasMetricQualifier;
  if (hasFahrenheit && hasCelsius) return undefined;
  if ([usCue, ukCue, metricCue].filter(Boolean).length > 1) return undefined;
  if (usCue) return "us";
  if (ukCue) return "uk_ie";
  if (metricCue) return "metric";
  if (hasCelsius && hasMetricWeight) return "metric";
  return undefined;
}
