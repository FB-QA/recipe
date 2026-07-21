import {
  convert,
  normalizeUnit,
  parseQuantity,
  selectFriendlyMass,
  selectFriendlyVolume,
  roundForDisplay,
  formatQuantityValue,
  UNIT_DEFINITIONS,
  type MeasurementRegion,
  type MeasurementSystem,
  type MeasurementUnit,
  type ConversionResult,
} from "@/lib/measurements";
import { scaleIngredientText } from "./scale";

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

/** Volume units whose millilitre value depends on region (cup, pint, spoons…). */
function isRegionSensitive(unit: MeasurementUnit): boolean {
  const def = UNIT_DEFINITIONS[unit];
  return def.dimension === "volume" && def.canonicalMultiplier == null;
}

/** Leading modifier words to step over when locating the unit ("about 500g"). */
const LEADING_MODIFIER = /^(?:about|approximately|approx|roughly|generous|heaped|rounded|level|scant)\s+/i;

/** Pull a leading quantity + unit token out of a raw line (legacy fallback). */
function legacyLead(text: string): { value: number | null; max: number | null; unitText: string | null } {
  const parsed = parseQuantity(text);
  // Find the unit AFTER any leading modifier and the numeric span, so
  // "about 500g chicken" yields "g", not "about".
  let rest = text.trim();
  while (LEADING_MODIFIER.test(rest)) rest = rest.replace(LEADING_MODIFIER, "");
  rest = rest.replace(/^\s*(?:\d+\s*[×x]\s*)?[\d\s.,/–—¼½¾⅓⅔⅛⅜⅝⅞+-]+/i, "").trim();
  const unitMatch = rest.match(/^([a-zA-Z.]+)/);
  return { value: parsed.value, max: parsed.max, unitText: unitMatch ? unitMatch[1] : null };
}

/** Pick a familiar US volume unit for a millilitre amount (spec §26). */
function pickUsVolumeUnit(ml: number): MeasurementUnit {
  const abs = Math.abs(ml);
  if (abs < 15) return "tsp";
  if (abs < 118) return "tbsp"; // up to ~½ US cup
  if (abs < 946) return "cup";
  return "quart";
}

/** The ingredient's name — prefer the structured field, else strip the amount. */
function nameOf(ing: AmountIngredient): string {
  if (ing.name && ing.name.trim()) return ing.name.trim();
  // Best-effort: drop leading modifier(s)/article, the numeric span, then a
  // recognised unit — so "about 500g chicken" yields "chicken", not the whole
  // line (which would render as "18 oz about 500g chicken").
  let s = ing.display_text.trim();
  while (LEADING_MODIFIER.test(s)) s = s.replace(LEADING_MODIFIER, "");
  s = s.replace(/^(?:an?)\s+/i, "");
  s = s.replace(/^\s*(?:\d+\s*[×x]\s*)?[\d\s.,/–—¼½¾⅓⅔⅛⅜⅝⅞+-]+/i, "");
  s = s.replace(/^\s*([a-zA-Z.]+)\s+/, (m, tok) => (normalizeUnit(tok).unit === "unknown" ? m : " "));
  return s.trim() || ing.display_text.trim();
}

/** Round a converted numeric for display: bands when approximate, tidy when exact. */
function roundDisplay(value: number, dimension: string, approximate: boolean): number {
  if (approximate) return roundForDisplay(value, dimension as never);
  const abs = Math.abs(value);
  if (abs >= 100) return Math.round(value);
  if (abs >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

/**
 * The friendly display unit for a converted value. Friendly promotion
 * (g↔kg↔mg, ml↔L) applies ONLY to metric units — an imperial target (oz, lb,
 * fl_oz) keeps its own unit, never routed back through the metric picker.
 */
function chosenDisplayUnit(value: number, unit: MeasurementUnit): MeasurementUnit {
  if (unit === "g" || unit === "kg" || unit === "mg") {
    return selectFriendlyMass(value * (UNIT_DEFINITIONS[unit].canonicalMultiplier ?? 1)).unit;
  }
  if (unit === "ml" || unit === "l") {
    return selectFriendlyVolume(value * (UNIT_DEFINITIONS[unit].canonicalMultiplier ?? 1)).unit;
  }
  return unit;
}

/** Re-express a value from its converted unit into the chosen display unit. */
function inDisplayUnit(value: number, fromUnit: MeasurementUnit, displayUnit: MeasurementUnit): number {
  const canonical = value * (UNIT_DEFINITIONS[fromUnit].canonicalMultiplier ?? 1);
  return canonical / (UNIT_DEFINITIONS[displayUnit].canonicalMultiplier ?? 1);
}

const NO_FRACTION_UNITS = new Set<MeasurementUnit>(["g", "kg", "mg", "ml", "l"]);

function renderNumber(displayValue: number, displayUnit: MeasurementUnit, dimension: string, approximate: boolean): string {
  const rounded = roundDisplay(displayValue, dimension, approximate);
  const useFractions = UNIT_DEFINITIONS[displayUnit].allowFractions && !NO_FRACTION_UNITS.has(displayUnit);
  return useFractions ? formatQuantityValue(rounded) : String(rounded);
}

function formatConverted(result: ConversionResult): string {
  const unit = result.convertedUnit!;
  const dimension = UNIT_DEFINITIONS[unit].dimension;
  const lo = result.convertedQuantity!;
  const hi = result.convertedQuantityMax ?? null;
  // Pick ONE display unit for the whole range, driven by the larger endpoint,
  // so "900–1100 ml" becomes "0.9–1.1 L", never a mismatched "900–1.1 ml".
  const driver = Math.max(Math.abs(lo), Math.abs(hi ?? lo));
  const displayUnit = chosenDisplayUnit(driver, unit);
  const label = UNIT_DEFINITIONS[displayUnit].shortLabel;
  const loNum = renderNumber(inDisplayUnit(lo, unit, displayUnit), displayUnit, dimension, result.approximate);
  const amount =
    hi != null
      ? `${loNum}–${renderNumber(inDisplayUnit(hi, unit, displayUnit), displayUnit, dimension, result.approximate)} ${label}`
      : `${loNum} ${label}`;
  return result.approximate ? `≈ ${amount}` : amount;
}

export function renderIngredientAmount(ing: AmountIngredient, opts: RenderOptions): RenderedIngredientAmount {
  const sourceText = ing.display_text;
  const scaled = () => scaleIngredientText(ing.display_text, opts.scale);

  // "Original" — scale the imported line, do not convert.
  if (opts.targetSystem === "original") {
    return { text: scaled(), status: "original", approximate: false, sourceText };
  }

  // 1. Resolve the original quantity/range + unit from structured fields,
  //    with a safe legacy parse of the raw line when they're missing. A real v2
  //    range stores quantity_value: null with quantity_min/max populated, so the
  //    lower bound comes from quantity_min when quantity_value is absent.
  let value = ing.quantity_value ?? ing.quantity_min ?? null;
  let max = ing.quantity_max ?? null;
  let unitText = ing.unit ?? null;
  if (value == null || !unitText) {
    const lead = legacyLead(ing.display_text);
    if (value == null) {
      value = lead.value;
      if (max == null) max = lead.max;
    }
    if (!unitText) unitText = lead.unitText;
  }

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

  // Region-sensitive units only convert when the region is genuinely known.
  if (isRegionSensitive(norm.unit) && !opts.sourceRegion) return fallback("ambiguous_region");

  // 2. Scale the ORIGINAL numeric, then convert the scaled value.
  const result = convert({
    quantity: value * opts.scale,
    quantityMax: max != null ? max * opts.scale : undefined,
    fromUnit: norm.unit,
    targetSystem: opts.targetSystem,
    sourceRegion: opts.sourceRegion,
  });

  if (result.error || result.convertedQuantity == null || result.convertedUnit == null) {
    return fallback("unsupported_conversion");
  }

  // US selection renders volume in familiar US units (cups/tbsp/tsp), not ml
  // (spec §26). Metric and UK/IE keep ml/L. Driven by the larger endpoint so a
  // range stays in one unit. Target region is US (known), so this is exact.
  let display = result;
  if (opts.targetSystem === "us" && result.convertedUnit === "ml") {
    const driverMl = Math.max(Math.abs(result.convertedQuantity), Math.abs(result.convertedQuantityMax ?? result.convertedQuantity));
    const usUnit = pickUsVolumeUnit(driverMl);
    const usResult = convert({
      quantity: result.convertedQuantity,
      quantityMax: result.convertedQuantityMax,
      fromUnit: "ml",
      toUnit: usUnit,
      sourceRegion: "us",
    });
    if (!usResult.error && usResult.convertedQuantity != null) display = usResult;
  }

  const amount = formatConverted(display);
  const name = nameOf(ing);
  // Preserve a separate preparation field ("toasted", "finely chopped") — it's
  // a cooking instruction, not noise, and must survive conversion.
  const prep = ing.preparation?.trim();
  const namePart = name && prep ? `${name}, ${prep}` : name || prep || "";
  const text = namePart ? `${amount} ${namePart}` : amount;
  return { text, status: "converted", approximate: result.approximate, sourceText };
}
