/**
 * Unit definitions — dimension, labels, aliases and canonical multipliers for
 * every unit the engine knows. Region-dependent volume units carry no
 * multiplier (their ml value lives in regional-profiles); temperature is
 * formula/lookup based. Constants from docs/spec/measurement-conversion.md.
 */

import type { MeasurementUnit, UnitDefinition } from "./measurement-types";

export const UNIT_DEFINITIONS: Record<MeasurementUnit, UnitDefinition> = {
  // ---------------- weight (canonical: grams) ----------------
  mg: { id: "mg", dimension: "weight", singularLabel: "milligram", pluralLabel: "milligrams", shortLabel: "mg", aliases: ["mg", "milligram", "milligrams"], canonicalMultiplier: 0.001, allowFractions: false, allowDecimals: true },
  g: { id: "g", dimension: "weight", singularLabel: "gram", pluralLabel: "grams", shortLabel: "g", aliases: ["g", "gram", "grams", "gr", "gm"], canonicalMultiplier: 1, allowFractions: false, allowDecimals: true },
  kg: { id: "kg", dimension: "weight", singularLabel: "kilogram", pluralLabel: "kilograms", shortLabel: "kg", aliases: ["kg", "kilogram", "kilograms", "kilo", "kilos"], canonicalMultiplier: 1000, allowFractions: true, allowDecimals: true },
  oz: { id: "oz", dimension: "weight", singularLabel: "ounce", pluralLabel: "ounces", shortLabel: "oz", aliases: ["oz", "ounce", "ounces"], canonicalMultiplier: 28.349523125, allowFractions: true, allowDecimals: true },
  lb: { id: "lb", dimension: "weight", singularLabel: "pound", pluralLabel: "pounds", shortLabel: "lb", aliases: ["lb", "lbs", "pound", "pounds"], canonicalMultiplier: 453.59237, allowFractions: true, allowDecimals: true },

  // ---------------- volume (canonical: millilitres) ----------------
  ml: { id: "ml", dimension: "volume", singularLabel: "millilitre", pluralLabel: "millilitres", shortLabel: "ml", aliases: ["ml", "millilitre", "millilitres", "milliliter", "milliliters", "cc"], canonicalMultiplier: 1, allowFractions: false, allowDecimals: true },
  l: { id: "l", dimension: "volume", singularLabel: "litre", pluralLabel: "litres", shortLabel: "L", aliases: ["l", "litre", "litres", "liter", "liters"], canonicalMultiplier: 1000, allowFractions: true, allowDecimals: true },
  // region-dependent — no canonicalMultiplier; see regional-profiles
  tsp: { id: "tsp", dimension: "volume", singularLabel: "teaspoon", pluralLabel: "teaspoons", shortLabel: "tsp", aliases: ["tsp", "tsps", "teaspoon", "teaspoons"], regionalDefinition: {}, allowFractions: true, allowDecimals: true },
  tbsp: { id: "tbsp", dimension: "volume", singularLabel: "tablespoon", pluralLabel: "tablespoons", shortLabel: "tbsp", aliases: ["tbsp", "tbsps", "tablespoon", "tablespoons", "tbl", "tbs"], regionalDefinition: {}, allowFractions: true, allowDecimals: true },
  cup: { id: "cup", dimension: "volume", singularLabel: "cup", pluralLabel: "cups", shortLabel: "cup", aliases: ["cup", "cups"], regionalDefinition: {}, allowFractions: true, allowDecimals: true },
  fl_oz: { id: "fl_oz", dimension: "volume", singularLabel: "fluid ounce", pluralLabel: "fluid ounces", shortLabel: "fl oz", aliases: ["fl oz", "fl. oz.", "fl.oz", "floz", "fluid ounce", "fluid ounces"], regionalDefinition: {}, allowFractions: true, allowDecimals: true },
  pint: { id: "pint", dimension: "volume", singularLabel: "pint", pluralLabel: "pints", shortLabel: "pt", aliases: ["pt", "pint", "pints"], regionalDefinition: {}, allowFractions: true, allowDecimals: true },
  quart: { id: "quart", dimension: "volume", singularLabel: "quart", pluralLabel: "quarts", shortLabel: "qt", aliases: ["qt", "quart", "quarts"], regionalDefinition: {}, allowFractions: true, allowDecimals: true },
  gallon: { id: "gallon", dimension: "volume", singularLabel: "gallon", pluralLabel: "gallons", shortLabel: "gal", aliases: ["gal", "gallon", "gallons"], regionalDefinition: {}, allowFractions: true, allowDecimals: true },

  // ---------------- temperature (formula / lookup) ----------------
  celsius: { id: "celsius", dimension: "temperature", singularLabel: "degree Celsius", pluralLabel: "degrees Celsius", shortLabel: "°C", aliases: ["c", "celsius", "centigrade", "°c", "degc"], allowFractions: false, allowDecimals: true },
  fahrenheit: { id: "fahrenheit", dimension: "temperature", singularLabel: "degree Fahrenheit", pluralLabel: "degrees Fahrenheit", shortLabel: "°F", aliases: ["f", "fahrenheit", "°f", "degf"], allowFractions: false, allowDecimals: true },
  gas_mark: { id: "gas_mark", dimension: "temperature", singularLabel: "gas mark", pluralLabel: "gas mark", shortLabel: "gas mark", aliases: ["gas mark", "gas", "gm"], allowFractions: true, allowDecimals: false },

  // ---------------- length (canonical: millimetres) ----------------
  mm: { id: "mm", dimension: "length", singularLabel: "millimetre", pluralLabel: "millimetres", shortLabel: "mm", aliases: ["mm", "millimetre", "millimetres", "millimeter", "millimeters"], canonicalMultiplier: 1, allowFractions: false, allowDecimals: true },
  cm: { id: "cm", dimension: "length", singularLabel: "centimetre", pluralLabel: "centimetres", shortLabel: "cm", aliases: ["cm", "centimetre", "centimetres", "centimeter", "centimeters"], canonicalMultiplier: 10, allowFractions: false, allowDecimals: true },
  m: { id: "m", dimension: "length", singularLabel: "metre", pluralLabel: "metres", shortLabel: "m", aliases: ["m", "metre", "metres", "meter", "meters"], canonicalMultiplier: 1000, allowFractions: true, allowDecimals: true },
  inch: { id: "inch", dimension: "length", singularLabel: "inch", pluralLabel: "inches", shortLabel: "in", aliases: ["in", "inch", "inches", '"'], canonicalMultiplier: 25.4, allowFractions: true, allowDecimals: true },

  // ---------------- count & informal (never converted in Phase 1) ----------------
  count: { id: "count", dimension: "count", singularLabel: "", pluralLabel: "", shortLabel: "", aliases: [], allowFractions: false, allowDecimals: false },
  pinch: { id: "pinch", dimension: "informal", singularLabel: "pinch", pluralLabel: "pinches", shortLabel: "pinch", aliases: ["pinch", "pinches"], allowFractions: false, allowDecimals: false },
  dash: { id: "dash", dimension: "informal", singularLabel: "dash", pluralLabel: "dashes", shortLabel: "dash", aliases: ["dash", "dashes"], allowFractions: false, allowDecimals: false },
  handful: { id: "handful", dimension: "informal", singularLabel: "handful", pluralLabel: "handfuls", shortLabel: "handful", aliases: ["handful", "handfuls"], allowFractions: false, allowDecimals: false },
  clove: { id: "clove", dimension: "count", singularLabel: "clove", pluralLabel: "cloves", shortLabel: "clove", aliases: ["clove", "cloves"], allowFractions: false, allowDecimals: false },
  slice: { id: "slice", dimension: "count", singularLabel: "slice", pluralLabel: "slices", shortLabel: "slice", aliases: ["slice", "slices"], allowFractions: false, allowDecimals: false },
  sprig: { id: "sprig", dimension: "count", singularLabel: "sprig", pluralLabel: "sprigs", shortLabel: "sprig", aliases: ["sprig", "sprigs"], allowFractions: false, allowDecimals: false },
  bunch: { id: "bunch", dimension: "count", singularLabel: "bunch", pluralLabel: "bunches", shortLabel: "bunch", aliases: ["bunch", "bunches"], allowFractions: false, allowDecimals: false },
  piece: { id: "piece", dimension: "count", singularLabel: "piece", pluralLabel: "pieces", shortLabel: "piece", aliases: ["piece", "pieces"], allowFractions: false, allowDecimals: false },
  can: { id: "can", dimension: "count", singularLabel: "can", pluralLabel: "cans", shortLabel: "can", aliases: ["can", "cans"], allowFractions: false, allowDecimals: false },
  tin: { id: "tin", dimension: "count", singularLabel: "tin", pluralLabel: "tins", shortLabel: "tin", aliases: ["tin", "tins"], allowFractions: false, allowDecimals: false },
  packet: { id: "packet", dimension: "count", singularLabel: "packet", pluralLabel: "packets", shortLabel: "packet", aliases: ["packet", "packets"], allowFractions: false, allowDecimals: false },
  pack: { id: "pack", dimension: "count", singularLabel: "pack", pluralLabel: "packs", shortLabel: "pack", aliases: ["pack", "packs"], allowFractions: false, allowDecimals: false },
  jar: { id: "jar", dimension: "count", singularLabel: "jar", pluralLabel: "jars", shortLabel: "jar", aliases: ["jar", "jars"], allowFractions: false, allowDecimals: false },
  bottle: { id: "bottle", dimension: "count", singularLabel: "bottle", pluralLabel: "bottles", shortLabel: "bottle", aliases: ["bottle", "bottles"], allowFractions: false, allowDecimals: false },
  stick: { id: "stick", dimension: "count", singularLabel: "stick", pluralLabel: "sticks", shortLabel: "stick", aliases: ["stick", "sticks"], allowFractions: false, allowDecimals: false },
  cube: { id: "cube", dimension: "count", singularLabel: "cube", pluralLabel: "cubes", shortLabel: "cube", aliases: ["cube", "cubes"], allowFractions: false, allowDecimals: false },
  head: { id: "head", dimension: "count", singularLabel: "head", pluralLabel: "heads", shortLabel: "head", aliases: ["head", "heads"], allowFractions: false, allowDecimals: false },
  stalk: { id: "stalk", dimension: "count", singularLabel: "stalk", pluralLabel: "stalks", shortLabel: "stalk", aliases: ["stalk", "stalks"], allowFractions: false, allowDecimals: false },
  fillet: { id: "fillet", dimension: "count", singularLabel: "fillet", pluralLabel: "fillets", shortLabel: "fillet", aliases: ["fillet", "fillets"], allowFractions: false, allowDecimals: false },
  breast: { id: "breast", dimension: "count", singularLabel: "breast", pluralLabel: "breasts", shortLabel: "breast", aliases: ["breast", "breasts"], allowFractions: false, allowDecimals: false },
  thigh: { id: "thigh", dimension: "count", singularLabel: "thigh", pluralLabel: "thighs", shortLabel: "thigh", aliases: ["thigh", "thighs"], allowFractions: false, allowDecimals: false },
  to_taste: { id: "to_taste", dimension: "informal", singularLabel: "to taste", pluralLabel: "to taste", shortLabel: "to taste", aliases: ["to taste"], allowFractions: false, allowDecimals: false },
  as_needed: { id: "as_needed", dimension: "informal", singularLabel: "as needed", pluralLabel: "as needed", shortLabel: "as needed", aliases: ["as needed", "as required", "for serving", "for garnish"], allowFractions: false, allowDecimals: false },

  unknown: { id: "unknown", dimension: "unknown", singularLabel: "", pluralLabel: "", shortLabel: "", aliases: [], allowFractions: false, allowDecimals: false },
};

/** Gas mark → Celsius / Fahrenheit. Lookup only; never derived by formula. */
export const GAS_MARK_TABLE: { gasMark: number; celsius: number; fahrenheit: number }[] = [
  { gasMark: 0.25, celsius: 110, fahrenheit: 225 },
  { gasMark: 0.5, celsius: 120, fahrenheit: 250 },
  { gasMark: 1, celsius: 140, fahrenheit: 275 },
  { gasMark: 2, celsius: 150, fahrenheit: 300 },
  { gasMark: 3, celsius: 170, fahrenheit: 325 },
  { gasMark: 4, celsius: 180, fahrenheit: 350 },
  { gasMark: 5, celsius: 190, fahrenheit: 375 },
  { gasMark: 6, celsius: 200, fahrenheit: 400 },
  { gasMark: 7, celsius: 220, fahrenheit: 425 },
  { gasMark: 8, celsius: 230, fahrenheit: 450 },
  { gasMark: 9, celsius: 240, fahrenheit: 475 },
];
