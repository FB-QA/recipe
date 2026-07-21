/**
 * Regional volume profiles — the exact millilitre value of each region-
 * dependent unit. Cooking units differ by region; a US cup is not a metric
 * cup. All constants verbatim from docs/spec/measurement-conversion.md.
 */

import type { MeasurementRegion, MeasurementUnit } from "./measurement-types";

/** ml value of a region-dependent volume unit, per region. */
export const REGIONAL_VOLUME_ML: Record<
  MeasurementRegion,
  Partial<Record<MeasurementUnit, number>>
> = {
  metric: {
    tsp: 5,
    tbsp: 15,
    cup: 250,
  },
  us: {
    tsp: 4.92892159375,
    tbsp: 14.78676478125,
    cup: 236.5882365,
    fl_oz: 29.5735295625,
    pint: 473.176473,
    quart: 946.352946,
    gallon: 3785.411784,
  },
  uk_ie: {
    tsp: 5,
    tbsp: 15,
    cup: 250,
    fl_oz: 28.4130625, // imperial fluid ounce
    pint: 568.26125, // imperial pint
    gallon: 4546.09, // imperial gallon
  },
  australia: {
    tsp: 5,
    tbsp: 20, // the distinctive Australian tablespoon
    cup: 250,
  },
};

/**
 * The default region assumed for a unit when none is stated. Region-neutral
 * units (ml, l) are unaffected. Non-metric-native units (fl_oz, pint, quart,
 * gallon) default to US, matching how they most commonly appear in imports;
 * a detected/confirmed region overrides this.
 */
export const DEFAULT_UNIT_REGION: Partial<Record<MeasurementUnit, MeasurementRegion>> = {
  tsp: "metric",
  tbsp: "metric",
  cup: "us",
  fl_oz: "us",
  pint: "us",
  quart: "us",
  gallon: "us",
};

/** The region a target `MeasurementSystem` maps onto for volume lookups. */
export const SYSTEM_REGION: Record<"metric" | "us" | "uk_ie", MeasurementRegion> = {
  metric: "metric",
  us: "us",
  uk_ie: "uk_ie",
};

/**
 * Resolve a region-dependent volume unit to millilitres for a given region,
 * falling back through metric if the region does not define it.
 */
export function regionalMl(unit: MeasurementUnit, region: MeasurementRegion): number | undefined {
  return REGIONAL_VOLUME_ML[region]?.[unit] ?? REGIONAL_VOLUME_ML.metric?.[unit];
}
