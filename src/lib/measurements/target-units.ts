import type { MeasurementDimension, MeasurementSystem, MeasurementUnit } from "./measurement-types";
import { UNIT_DEFINITIONS } from "./unit-definitions";
import { selectFriendlyMass, selectFriendlyVolume } from "./quantity-formatter";

/**
 * Centralised friendly target-unit selection: given a value in a dimension's
 * canonical unit (grams / millilitres / millimetres) and a target system,
 * choose the familiar unit to DISPLAY in. One home for the "which unit" policy,
 * so the bridge never re-implements it (and US weight promotes to pounds).
 */

/** Grams in one pound — sourced from the unit definition, never hardcoded. */
const GRAMS_PER_POUND = UNIT_DEFINITIONS.lb.canonicalMultiplier ?? 453.59237;

/** Familiar US volume unit for a millilitre amount. */
function pickUsVolumeUnit(ml: number): MeasurementUnit {
  const abs = Math.abs(ml);
  if (abs < 15) return "tsp";
  if (abs < 118) return "tbsp"; // up to ~½ US cup
  if (abs < 946) return "cup";
  return "quart";
}

export function selectSystemUnit(
  canonicalValue: number,
  dimension: MeasurementDimension,
  system: Exclude<MeasurementSystem, "original">,
): MeasurementUnit {
  const abs = Math.abs(canonicalValue);
  switch (dimension) {
    case "weight":
      // US promotes to pounds for large amounts (2 kg → ~4⅜ lb, not 70½ oz).
      if (system === "us") return abs < GRAMS_PER_POUND ? "oz" : "lb";
      return selectFriendlyMass(abs).unit; // metric + UK/IE: mg / g / kg
    case "volume":
      if (system === "us") return pickUsVolumeUnit(abs);
      return selectFriendlyVolume(abs).unit; // metric + UK/IE favour metric
    case "length":
      if (system === "us") return "inch";
      return abs < 10 ? "mm" : abs < 1000 ? "cm" : "m";
    case "temperature":
      return system === "us" ? "fahrenheit" : "celsius";
    default:
      return "unknown";
  }
}
