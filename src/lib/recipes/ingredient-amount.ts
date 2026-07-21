import {
  convert,
  normalizeUnit,
  parseQuantity,
  formatQuantityValue,
  selectSystemUnit,
  SYSTEM_REGION,
  UNICODE_FRACTION_CHARS,
  UNIT_DEFINITIONS,
  type MeasurementDimension,
  type MeasurementRegion,
  type MeasurementSystem,
  type MeasurementUnit,
  type ConversionResult,
} from "@/lib/measurements";
import { scaleIngredientText } from "./scale";
import { reduceMeasurementGroups } from "./measurement-annotations";

/**
 * The bridge between a stored ingredient and its displayed amount for a chosen
 * portion scale + measurement system. It ALWAYS calculates from the original
 * structured value (spec principle 7 — never from a rendered/rounded one), and
 * falls back to the existing text scaler whenever structured conversion is
 * unavailable or unsafe, so a recipe never breaks on one odd ingredient.
 */

export type IngredientConversionStatus =
  | "converted"
  | "original"
  | "fallback_text_scaling"
  | "missing_quantity"
  | "unrecognised_unit"
  | "ambiguous_unit"
  | "ambiguous_region"
  | "unsupported_conversion";

export interface RenderedIngredientAmount {
  /** The full display line (amount + name), scaled and/or converted. */
  text: string;
  status: IngredientConversionStatus;
  approximate: boolean;
  /** The original imported line, always available for reference. */
  sourceText: string;
}

/** The structured shape the bridge reads. A superset of the display type. */
export interface AmountIngredient {
  display_text: string;
  name?: string | null;
  unit?: string | null;
  quantity?: string | null;
  quantity_value?: number | null;
  quantity_min?: number | null;
  quantity_max?: number | null;
  preparation?: string | null;
}

export interface RenderOptions {
  scale: number;
  targetSystem: MeasurementSystem;
  /** The recipe's detected source region; undefined when unknown. */
  sourceRegion?: MeasurementRegion;
}

/** The dimension's canonical unit, used as the pivot for target selection. */
const CANONICAL_UNIT: Partial<Record<MeasurementDimension, MeasurementUnit>> = {
  weight: "g",
  volume: "ml",
  length: "mm",
};

/**
 * Measuring-spoon units that are the same implement in every system and so are
 * NEVER converted to ml between Metric and US — only scaled. (Cups DO convert:
 * a metric cup 250 ml vs US 236 ml differ enough to matter, and ml is a useful
 * jug measure at that size.)
 */
const PRESERVED_UNITS = new Set<MeasurementUnit>(["tsp", "tbsp"]);

/** Volume units whose millilitre value depends on region (cup, pint, spoons…). */
function isRegionSensitive(unit: MeasurementUnit): boolean {
  const def = UNIT_DEFINITIONS[unit];
  return def.dimension === "volume" && def.canonicalMultiplier == null;
}

/** Leading modifier words to step over when locating the unit ("about 500g"). */
const LEADING_MODIFIER = /^(?:about|approximately|approx|roughly|generous|heaped|rounded|level|scant)\s+/i;

// The leading numeric span (optional "N×" multiplier, digits, decimals, typed
// and unicode fractions). Uses the SAME fraction set the quantity parser
// accepts, so a legacy row like "⅕ cup oil" is stripped consistently — it
// always converts or intentionally falls back, never fails on a fraction gap.
const LEADING_NUMERIC = new RegExp(String.raw`^\s*(?:\d+\s*[×x]\s*)?[\d\s.,/–—${UNICODE_FRACTION_CHARS}+-]+`, "i");

// A bounded leading-quantity slice: optional modifiers/article, then the number
// span. Parsing ONLY this slice (not the whole line) stops trailing name
// pollution — a "/ all-purpose flour" alternative, a hyphen in "all-purpose" —
// from corrupting the quantity parse.
const LEADING_QUANTITY_SLICE = new RegExp(
  String.raw`^(?:(?:about|approximately|approx|roughly|generous|heaped|rounded|level|scant|an?)\s+)*(?:\d+\s*[×x]\s*)?[\d\s.,/–—${UNICODE_FRACTION_CHARS}+-]+`,
  "i",
);

/**
 * ONE legacy parser for a raw ingredient line — the amount/range, the unit and
 * the remaining name, so `legacyLead` and `nameOf` never drift apart. Used only
 * when the structured fields are absent.
 */
function parseLegacyIngredient(text: string): {
  value: number | null;
  max: number | null;
  unit: string | null;
  name: string;
} {
  const t = text.trim();
  // Value from the bounded leading slice only (see LEADING_QUANTITY_SLICE).
  const slice = t.match(LEADING_QUANTITY_SLICE)?.[0]?.trim();
  const parsed = parseQuantity(slice || t);
  let rest = t;
  while (LEADING_MODIFIER.test(rest)) rest = rest.replace(LEADING_MODIFIER, "");
  rest = rest.replace(/^(?:an?)\s+/i, "");
  rest = rest.replace(LEADING_NUMERIC, "").trim();
  // Match the LONGEST supported unit phrase (up to two words), so multi-word
  // units like "fl oz" resolve instead of capturing only "fl".
  let unit: string | null = null;
  let name = rest;
  const tokens = rest.split(/\s+/).filter(Boolean);
  for (const n of [2, 1]) {
    if (tokens.length < n) continue;
    const phrase = tokens.slice(0, n).join(" ");
    if (/^[a-zA-Z. ]+$/.test(phrase) && normalizeUnit(phrase).unit !== "unknown") {
      unit = phrase;
      name = tokens.slice(n).join(" ");
      break;
    }
  }
  return { value: parsed.value, max: parsed.max, unit, name: name || text.trim() };
}

const NO_FRACTION_UNITS = new Set<MeasurementUnit>(["g", "kg", "mg", "ml", "l"]);

/** Tidy a converted value for display (exact conversions — no lossy bands). */
function roundDisplay(value: number): number {
  const abs = Math.abs(value);
  if (abs >= 100) return Math.round(value);
  if (abs >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

/** Format a conversion result (already in its chosen display unit). */
function formatConverted(result: ConversionResult): string {
  const unit = result.convertedUnit!;
  const useFractions = UNIT_DEFINITIONS[unit].allowFractions && !NO_FRACTION_UNITS.has(unit);
  const fmt = (v: number) => (useFractions ? formatQuantityValue(roundDisplay(v)) : String(roundDisplay(v)));
  const label = UNIT_DEFINITIONS[unit].shortLabel;
  const hi = result.convertedQuantityMax;
  return hi != null ? `${fmt(result.convertedQuantity!)}–${fmt(hi)} ${label}` : `${fmt(result.convertedQuantity!)} ${label}`;
}

export function renderIngredientAmount(ing: AmountIngredient, opts: RenderOptions): RenderedIngredientAmount {
  const sourceText = ing.display_text;

  // "Original" — scale the imported line, do not convert.
  if (opts.targetSystem === "original") {
    return { text: scaleIngredientText(ing.display_text, opts.scale), status: "original", approximate: false, sourceText };
  }
  const system = opts.targetSystem;

  // Reduce any pre-written multi-unit annotations ("200g / 7 oz") to the chosen
  // system BEFORE parsing, so the whole line reflects the selection rather than
  // showing every unit. Everything below works on this reduced text.
  const displayText = reduceMeasurementGroups(ing.display_text, system === "us" ? "us" : "metric");
  const scaled = () => scaleIngredientText(displayText, opts.scale);

  // A leading "N × M<unit>" multiplier ("2 x 125g") is a COUNT of items with a
  // per-item size — the leading number has no unit of its own, so converting it
  // (pairing the count with the per-item unit) is meaningless. Keep the original,
  // scaled line; the count scales with portions via scaleIngredientText.
  if (/^\s*\d+(?:\.\d+)?\s*[×x]\s*\d/i.test(displayText)) {
    return { text: scaled(), status: "unsupported_conversion", approximate: false, sourceText };
  }

  // 1. Resolve the original quantity/range + unit + name. A real v2 range stores
  //    quantity_value: null with quantity_min/max populated, so the lower bound
  //    comes from quantity_min. One legacy parse fills any missing piece.
  const legacy = parseLegacyIngredient(displayText);
  const value = ing.quantity_value ?? ing.quantity_min ?? legacy.value;
  const max = ing.quantity_max ?? legacy.max;
  const unitText = ing.unit ?? legacy.unit;
  // The importer sometimes stores the WHOLE line in `name` (quantity + unit +
  // noun). If it still leads with a quantity, don't trust it — use the stripped
  // legacy name, so the converted amount isn't prepended to the original line
  // ("10 ml 2 tsp vanilla" ✗ → "10 ml vanilla" ✓).
  const rawName = ing.name?.trim();
  const name = rawName && !LEADING_NUMERIC.test(rawName) ? rawName : legacy.name;

  const fallback = (status: IngredientConversionStatus): RenderedIngredientAmount => ({
    text: scaled(),
    status,
    approximate: false,
    sourceText,
  });

  if (value == null) return fallback("missing_quantity");
  const norm = normalizeUnit(unitText ?? "");
  if (norm.unit === "unknown") return fallback("unrecognised_unit");
  if (norm.ambiguous) return fallback("ambiguous_unit");

  // Measuring SPOONS (tsp, tbsp) are system-neutral kitchen implements — a
  // teaspoon is 5 ml in every system, and cooks measure them with a spoon, not
  // by millilitres. So "1 tsp" stays "1 tsp" in Metric and US; converting to
  // "5 ml" is technically right but practically useless (research, §26). They
  // scale with portions but never change unit.
  if (PRESERVED_UNITS.has(norm.unit)) {
    return { text: scaled(), status: "converted", approximate: false, sourceText };
  }

  if (isRegionSensitive(norm.unit) && !opts.sourceRegion) return fallback("ambiguous_region");

  const dimension = UNIT_DEFINITIONS[norm.unit].dimension;
  // Temperatures are oven/liquid SETTINGS, not consumable amounts — never
  // multiplied by the portion factor. Everything else scales from the original.
  const scaledLo = dimension === "temperature" ? value : value * opts.scale;
  const scaledHi = max == null ? undefined : dimension === "temperature" ? max : max * opts.scale;

  // 2. Convert. Temperatures go straight to the system's scale; everything else
  //    pivots through the canonical unit so the LIBRARY picks the friendly
  //    target unit (US weight → lb for large amounts, US volume → cups, etc.).
  let result: ConversionResult;
  if (dimension === "temperature") {
    result = convert({
      quantity: scaledLo,
      quantityMax: scaledHi,
      fromUnit: norm.unit,
      toUnit: system === "us" ? "fahrenheit" : "celsius",
    });
  } else {
    const canonUnit = CANONICAL_UNIT[dimension];
    if (!canonUnit) return fallback("unsupported_conversion");
    // Step 1 — source → canonical (sourceRegion interprets the SOURCE unit).
    const canon = convert({ quantity: scaledLo, quantityMax: scaledHi, fromUnit: norm.unit, toUnit: canonUnit, sourceRegion: opts.sourceRegion });
    if (canon.error || canon.convertedQuantity == null) return fallback("unsupported_conversion");
    const driver = Math.max(Math.abs(canon.convertedQuantity), Math.abs(canon.convertedQuantityMax ?? canon.convertedQuantity));
    const targetUnit = selectSystemUnit(driver, dimension, system);
    // Step 2 — canonical → target (system region interprets the TARGET unit).
    result = convert({
      quantity: canon.convertedQuantity,
      quantityMax: canon.convertedQuantityMax,
      fromUnit: canonUnit,
      toUnit: targetUnit,
      sourceRegion: SYSTEM_REGION[system],
    });
  }

  if (result.error || result.convertedQuantity == null || result.convertedUnit == null) {
    return fallback("unsupported_conversion");
  }

  // No unit change ⇒ already in the target unit (e.g. grams stay grams in
  // Metric). Keep the ORIGINAL line's formatting rather than rebuilding it,
  // which would only reflow "50g" → "50 g" for no real change. The value is
  // already the correct target-system value, so status stays "converted".
  if (result.convertedUnit === norm.unit) {
    return { text: scaled(), status: "converted", approximate: false, sourceText };
  }

  const amount = formatConverted(result);
  // Preserve a separate preparation field ("toasted") — a cooking instruction.
  const prep = ing.preparation?.trim();
  const namePart = name && prep ? `${name}, ${prep}` : name || prep || "";
  const text = namePart ? `${amount} ${namePart}` : amount;
  return { text, status: "converted", approximate: false, sourceText };
}
