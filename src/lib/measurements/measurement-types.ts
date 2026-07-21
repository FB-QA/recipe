/**
 * Measurement conversion — the type contract.
 *
 * Phase 1 of the measurement system (docs/spec/measurement-conversion.md).
 * Pure types + the shapes every module in this folder shares. No logic here.
 */

// ------------------------------------------------------------------
// Dimensions & units
// ------------------------------------------------------------------

export type MeasurementDimension =
  | "weight"
  | "volume"
  | "temperature"
  | "length"
  | "count"
  | "informal"
  | "unknown";

/** Canonical unit codes. Free-text input is normalised into one of these. */
export type MeasurementUnit =
  // weight
  | "mg"
  | "g"
  | "kg"
  | "oz"
  | "lb"
  // volume
  | "ml"
  | "l"
  | "tsp"
  | "tbsp"
  | "cup"
  | "fl_oz"
  | "pint"
  | "quart"
  | "gallon"
  // temperature
  | "celsius"
  | "fahrenheit"
  | "gas_mark"
  // length
  | "mm"
  | "cm"
  | "m"
  | "inch"
  // count & informal (preserved, never converted in Phase 1)
  | "count"
  | "pinch"
  | "dash"
  | "handful"
  | "clove"
  | "slice"
  | "sprig"
  | "bunch"
  | "piece"
  | "can"
  | "tin"
  | "packet"
  | "pack"
  | "jar"
  | "bottle"
  | "stick"
  | "cube"
  | "head"
  | "stalk"
  | "fillet"
  | "breast"
  | "thigh"
  | "to_taste"
  | "as_needed"
  | "unknown";

/** A cooking region — chiefly changes what a "cup"/"pint"/"fl oz" mean. */
export type MeasurementRegion = "metric" | "us" | "uk_ie" | "australia";

/**
 * A user-facing target system. `original` means "do not convert"; the other
 * three drive both the target region and the preferred units for a dimension.
 */
export type MeasurementSystem = "original" | "metric" | "us" | "uk_ie";

// ------------------------------------------------------------------
// Unit definitions
// ------------------------------------------------------------------

export interface UnitDefinition {
  id: MeasurementUnit;
  dimension: MeasurementDimension;
  singularLabel: string;
  pluralLabel: string;
  shortLabel: string;
  aliases: string[];
  /**
   * Multiplier to the dimension's canonical unit (g / ml / mm). Absent for
   * region-dependent volume units (their value comes from a regional profile)
   * and for temperature (formula-based).
   */
  canonicalMultiplier?: number;
  /** Region-dependent value in the canonical unit (ml), when it varies. */
  regionalDefinition?: Partial<Record<MeasurementRegion, number>>;
  allowFractions: boolean;
  allowDecimals: boolean;
}

// ------------------------------------------------------------------
// Normalisation
// ------------------------------------------------------------------

export interface NormalizedUnitResult {
  unit: MeasurementUnit;
  /** 0..1. 1 = exact canonical/alias hit; low = weak or ambiguous. */
  confidence: number;
  originalText: string;
  /** True when the input could mean more than one unit (e.g. `t` / `T`). */
  ambiguous?: boolean;
  /** Candidate units when ambiguous, most-likely first. */
  candidates?: MeasurementUnit[];
}

// ------------------------------------------------------------------
// Quantity parsing
// ------------------------------------------------------------------

export type QuantityModifier =
  | "about"
  | "approximately"
  | "roughly"
  | "generous"
  | "heaped"
  | "rounded"
  | "level"
  | "scant";

export interface ParsedQuantity {
  /** The (lower bound of the) quantity. */
  value: number | null;
  /** Upper bound when the source was a range (`2–3`), else null. */
  max: number | null;
  /** The raw numeric span as written ("1 1/2", "2–3"), for display fallback. */
  text: string | null;
  isRange: boolean;
  modifiers: QuantityModifier[];
  /** 0..1. Low when nothing numeric could be read. */
  confidence: number;
}

// ------------------------------------------------------------------
// Conversion
// ------------------------------------------------------------------

export type ConversionConfidence = "exact" | "high" | "medium" | "low" | "unavailable";

export type ConversionErrorCode =
  | "UNKNOWN_UNIT"
  | "INCOMPATIBLE_DIMENSIONS"
  | "MISSING_INGREDIENT_PROFILE"
  | "AMBIGUOUS_SOURCE_REGION"
  | "INVALID_QUANTITY"
  | "UNSUPPORTED_CONVERSION"
  | "LOW_CONFIDENCE_PARSE";

export interface ConversionResult {
  originalQuantity: number;
  originalQuantityMax?: number;
  originalUnit: MeasurementUnit;

  convertedQuantity?: number;
  convertedQuantityMax?: number;
  convertedUnit?: MeasurementUnit;

  confidence: ConversionConfidence;
  approximate: boolean;

  error?: ConversionErrorCode;
  warning?: string;
  explanation?: string;
}

export interface MeasurementConversionRequest {
  quantity: number;
  quantityMax?: number;
  fromUnit: MeasurementUnit;
  /** Convert to this exact unit. Mutually exclusive with `targetSystem`. */
  toUnit?: MeasurementUnit;
  /** Convert to the best unit for this system. */
  targetSystem?: MeasurementSystem;
  /** The region the source quantity was written in (defaults per unit). */
  sourceRegion?: MeasurementRegion;
  /** Allow approximate (rounded / cross-profile) results. Default true. */
  allowApproximate?: boolean;
}
