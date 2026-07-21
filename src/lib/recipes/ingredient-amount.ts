import {
  convert,
  normalizeUnit,
  parseQuantity,
  formatQuantityValue,
  selectSystemUnit,
  SYSTEM_REGION,
  UNIT_DEFINITIONS,
  type MeasurementDimension,
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

/** The dimension's canonical unit, used as the pivot for target selection. */
const CANONICAL_UNIT: Partial<Record<MeasurementDimension, MeasurementUnit>> = {
  weight: "g",
  volume: "ml",
  length: "mm",
};

/** Volume units whose millilitre value depends on region (cup, pint, spoons…). */
function isRegionSensitive(unit: MeasurementUnit): boolean {
  const def = UNIT_DEFINITIONS[unit];
  return def.dimension === "volume" && def.canonicalMultiplier == null;
}

/** Leading modifier words to step over when locating the unit ("about 500g"). */
const LEADING_MODIFIER = /^(?:about|approximately|approx|roughly|generous|heaped|rounded|level|scant)\s+/i;

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
  const parsed = parseQuantity(text);
  let rest = text.trim();
  while (LEADING_MODIFIER.test(rest)) rest = rest.replace(LEADING_MODIFIER, "");
  rest = rest.replace(/^(?:an?)\s+/i, "");
  rest = rest.replace(/^\s*(?:\d+\s*[×x]\s*)?[\d\s.,/–—¼½¾⅓⅔⅛⅜⅝⅞+-]+/i, "").trim();
  let unit: string | null = null;
  let name = rest;
  const um = rest.match(/^([a-zA-Z.]+)(?:\s+|$)/);
  if (um && normalizeUnit(um[1]).unit !== "unknown") {
    unit = um[1];
    name = rest.slice(um[0].length).trim();
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
  const scaled = () => scaleIngredientText(ing.display_text, opts.scale);

  // "Original" — scale the imported line, do not convert.
  if (opts.targetSystem === "original") {
    return { text: scaled(), status: "original", approximate: false, sourceText };
  }
  const system = opts.targetSystem;

  // 1. Resolve the original quantity/range + unit + name. A real v2 range stores
  //    quantity_value: null with quantity_min/max populated, so the lower bound
  //    comes from quantity_min. One legacy parse fills any missing piece.
  const legacy = parseLegacyIngredient(ing.display_text);
  const value = ing.quantity_value ?? ing.quantity_min ?? legacy.value;
  const max = ing.quantity_max ?? legacy.max;
  const unitText = ing.unit ?? legacy.unit;
  const name = ing.name?.trim() || legacy.name;

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
  if (isRegionSensitive(norm.unit) && !opts.sourceRegion) return fallback("ambiguous_region");

  const dimension = UNIT_DEFINITIONS[norm.unit].dimension;
  const scaledLo = value * opts.scale;
  const scaledHi = max != null ? max * opts.scale : undefined;

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

  const amount = formatConverted(result);
  // Preserve a separate preparation field ("toasted") — a cooking instruction.
  const prep = ing.preparation?.trim();
  const namePart = name && prep ? `${name}, ${prep}` : name || prep || "";
  const text = namePart ? `${amount} ${namePart}` : amount;
  return { text, status: "converted", approximate: false, sourceText };
}
