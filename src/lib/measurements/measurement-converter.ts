/**
 * Measurement converter — deterministic, exact same-dimension conversion for
 * weight, volume (region-aware), temperature and length. Never crosses
 * dimensions and never fabricates a volume↔weight result without a density
 * profile (that arrives in Phase 3). Full precision in; rounding is display's
 * job, not the converter's. Spec: docs/spec/measurement-conversion.md §5–§11.
 */

import type {
  ConversionResult,
  MeasurementConversionRequest,
  MeasurementRegion,
  MeasurementSystem,
  MeasurementUnit,
} from "./measurement-types";
import { GAS_MARK_TABLE, UNIT_DEFINITIONS } from "./unit-definitions";
import { DEFAULT_UNIT_REGION, regionalMl, SYSTEM_REGION } from "./regional-profiles";

// ------------------------------------------------------------------
// volume helpers (canonical: millilitres)
// ------------------------------------------------------------------

function volumeToMl(quantity: number, unit: MeasurementUnit, region: MeasurementRegion): number | undefined {
  const def = UNIT_DEFINITIONS[unit];
  if (def.canonicalMultiplier != null) return quantity * def.canonicalMultiplier; // ml, l
  const ml = regionalMl(unit, region);
  return ml == null ? undefined : quantity * ml;
}

function mlToVolume(ml: number, unit: MeasurementUnit, region: MeasurementRegion): number | undefined {
  const def = UNIT_DEFINITIONS[unit];
  if (def.canonicalMultiplier != null) return ml / def.canonicalMultiplier;
  const per = regionalMl(unit, region);
  return per == null || per === 0 ? undefined : ml / per;
}

function volumeRegionFor(unit: MeasurementUnit, explicit?: MeasurementRegion): MeasurementRegion {
  return explicit ?? DEFAULT_UNIT_REGION[unit] ?? "metric";
}

// ------------------------------------------------------------------
// temperature helpers (canonical: Celsius)
// ------------------------------------------------------------------

function toCelsius(value: number, unit: MeasurementUnit): number | undefined {
  if (unit === "celsius") return value;
  if (unit === "fahrenheit") return ((value - 32) * 5) / 9;
  if (unit === "gas_mark") {
    // Gas marks are discrete oven settings. An out-of-table source value
    // (Gas 11, Gas 4.5) is unknown — return undefined so convert() reports it
    // unavailable rather than inventing the nearest real setting.
    const exact = GAS_MARK_TABLE.find((r) => r.gasMark === value);
    return exact ? exact.celsius : undefined;
  }
  return undefined;
}

function fromCelsius(celsius: number, unit: MeasurementUnit): number | undefined {
  if (unit === "celsius") return celsius;
  if (unit === "fahrenheit") return (celsius * 9) / 5 + 32;
  if (unit === "gas_mark") {
    return GAS_MARK_TABLE.reduce((best, cur) =>
      Math.abs(cur.celsius - celsius) < Math.abs(best.celsius - celsius) ? cur : best,
    ).gasMark;
  }
  return undefined;
}

// ------------------------------------------------------------------
// target-unit resolution for a whole system (drives Phase 2's toggle)
// ------------------------------------------------------------------

function systemTargetUnit(
  dimension: string,
  system: Exclude<MeasurementSystem, "original">,
): MeasurementUnit | undefined {
  switch (dimension) {
    case "weight":
      return system === "us" ? "oz" : "g";
    case "volume":
      return "ml"; // formatter promotes to L; Phase 2 owns cup/fl-oz choice
    case "temperature":
      return system === "us" ? "fahrenheit" : "celsius";
    case "length":
      return system === "us" ? "inch" : "mm";
    default:
      return undefined;
  }
}

// ------------------------------------------------------------------
// public entry
// ------------------------------------------------------------------

export function convert(req: MeasurementConversionRequest): ConversionResult {
  const { quantity, quantityMax, fromUnit, sourceRegion } = req;
  const fromDef = UNIT_DEFINITIONS[fromUnit];
  const base: ConversionResult = {
    originalQuantity: quantity,
    originalQuantityMax: quantityMax,
    originalUnit: fromUnit,
    confidence: "unavailable",
    approximate: false,
  };

  if (!Number.isFinite(quantity)) {
    return { ...base, error: "INVALID_QUANTITY", explanation: "Quantity must be a finite number." };
  }

  const dimension = fromDef.dimension;
  if (dimension === "count" || dimension === "informal" || dimension === "unknown") {
    return {
      ...base,
      error: "UNSUPPORTED_CONVERSION",
      warning: "This quantity is kept as written.",
    };
  }

  // Negatives are meaningless for weight/volume/length but legitimate for
  // temperature (a −18°C freezer, −40°F). Only reject them off-temperature.
  if (quantity < 0 && dimension !== "temperature") {
    return { ...base, error: "INVALID_QUANTITY", explanation: "Quantity must be non-negative." };
  }

  // "Original" means "do not convert" — return the value unchanged so a toggle
  // switching back to Original gets a successful passthrough, not an error.
  if (!req.toUnit && req.targetSystem === "original") {
    return {
      ...base,
      convertedUnit: fromUnit,
      convertedQuantity: quantity,
      convertedQuantityMax: quantityMax,
      confidence: "exact",
      approximate: false,
    };
  }

  // Resolve the target unit.
  let toUnit = req.toUnit;
  if (!toUnit) {
    if (req.targetSystem && req.targetSystem !== "original") {
      toUnit = systemTargetUnit(dimension, req.targetSystem);
    }
    if (!toUnit) {
      return { ...base, error: "UNSUPPORTED_CONVERSION", warning: "No target unit or system given." };
    }
  }

  const toDef = UNIT_DEFINITIONS[toUnit];

  // Dimension gate.
  if (toDef.dimension !== dimension) {
    const weightVolume =
      (dimension === "volume" && toDef.dimension === "weight") ||
      (dimension === "weight" && toDef.dimension === "volume");
    if (weightVolume) {
      return {
        ...base,
        error: "MISSING_INGREDIENT_PROFILE",
        warning: "A reliable weight conversion is not available for this ingredient.",
      };
    }
    return {
      ...base,
      error: "INCOMPATIBLE_DIMENSIONS",
      warning: `Cannot convert ${dimension} to ${toDef.dimension}.`,
    };
  }

  const crossSystem = req.targetSystem != null && req.toUnit == null;

  const one = convertOne(quantity, fromUnit, toUnit, dimension, sourceRegion, req.targetSystem);
  if (one === undefined) {
    return { ...base, error: "UNSUPPORTED_CONVERSION", warning: "Conversion is not available." };
  }

  const approximate = crossSystem || (dimension === "temperature" && toUnit === "gas_mark");

  // Honour an explicit allowApproximate:false — a caller enforcing an
  // exact-only display policy must not be handed an approximate result.
  if (approximate && req.allowApproximate === false) {
    return {
      ...base,
      error: "UNSUPPORTED_CONVERSION",
      warning: "Only an approximate conversion is available, and approximate results were disallowed.",
    };
  }

  const result: ConversionResult = {
    ...base,
    convertedUnit: toUnit,
    convertedQuantity: one,
    confidence: dimension === "temperature" && toUnit === "gas_mark" ? "high" : "exact",
    approximate,
  };

  if (quantityMax != null && Number.isFinite(quantityMax) && (quantityMax >= 0 || dimension === "temperature")) {
    const maxConverted = convertOne(quantityMax, fromUnit, toUnit, dimension, sourceRegion, req.targetSystem);
    if (maxConverted !== undefined) result.convertedQuantityMax = maxConverted;
  }

  return result;
}

function convertOne(
  quantity: number,
  fromUnit: MeasurementUnit,
  toUnit: MeasurementUnit,
  dimension: string,
  sourceRegion: MeasurementRegion | undefined,
  targetSystem: MeasurementSystem | undefined,
): number | undefined {
  if (dimension === "weight" || dimension === "length") {
    const fromMult = UNIT_DEFINITIONS[fromUnit].canonicalMultiplier;
    const toMult = UNIT_DEFINITIONS[toUnit].canonicalMultiplier;
    if (fromMult == null || toMult == null) return undefined;
    return (quantity * fromMult) / toMult;
  }

  if (dimension === "volume") {
    const fromRegion = volumeRegionFor(fromUnit, sourceRegion);
    const targetRegion =
      targetSystem && targetSystem !== "original"
        ? SYSTEM_REGION[targetSystem]
        : volumeRegionFor(toUnit, sourceRegion);
    const ml = volumeToMl(quantity, fromUnit, fromRegion);
    if (ml === undefined) return undefined;
    return mlToVolume(ml, toUnit, targetRegion);
  }

  if (dimension === "temperature") {
    const celsius = toCelsius(quantity, fromUnit);
    if (celsius === undefined) return undefined;
    return fromCelsius(celsius, toUnit);
  }

  return undefined;
}
