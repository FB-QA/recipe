import {
  convert,
  normalizeUnit,
  parseQuantity,
  formatQuantityValue,
  selectSystemUnit,
  SYSTEM_REGION,
  UNICODE_FRACTION_CHARS,
  UNIT_DEFINITIONS,
  findDensityProfile,
  gramsPerMl,
  type MeasurementDimension,
  type MeasurementRegion,
  type MeasurementSystem,
  type MeasurementUnit,
  type ConversionResult,
} from "@/lib/measurements";
import { scaleIngredientText, scaleAnnotatedText } from "./scale";
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
  /** Explanation for an approximate conversion (assumed prep) — surfaced in the UI. */
  note?: string;
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

// Leading quantity modifiers ("about 500g", "heaped 1 tbsp") — one source of
// truth, reused by the modifier-strip and the bounded-slice patterns below.
const MODIFIER_WORDS = String.raw`about|approximately|approx|roughly|generous|heaped|rounded|level|scant`;
// The leading numeric span: optional "N×" multiplier, then digits/decimals/typed
// and unicode fractions. Uses the SAME fraction set the quantity parser accepts,
// so a legacy row like "⅕ cup oil" is stripped consistently — it always converts
// or intentionally falls back, never fails on a fraction gap.
const NUMERIC_SPAN = String.raw`(?:\d+\s*[×x]\s*)?[\d\s.,/–—${UNICODE_FRACTION_CHARS}+-]+`;

/** Leading modifier words to step over when locating the unit ("about 500g"). */
const LEADING_MODIFIER = new RegExp(`^(?:${MODIFIER_WORDS})\\s+`, "i");
const LEADING_NUMERIC = new RegExp(`^\\s*${NUMERIC_SPAN}`, "i");

// A bounded leading-quantity slice: optional modifiers/article, then the number
// span. Parsing ONLY this slice (not the whole line) stops trailing name
// pollution — a "/ all-purpose flour" alternative, a hyphen in "all-purpose" —
// from corrupting the quantity parse.
const LEADING_QUANTITY_SLICE = new RegExp(`^(?:(?:${MODIFIER_WORDS}|an?)\\s+)*${NUMERIC_SPAN}`, "i");

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
    // Strip a region qualifier ("US cup" → "cup") and accept the symbol/hyphen
    // unit forms ("°C", "fl-oz") that normalizeUnit understands but a plain
    // alpha-only guard would reject.
    const candidate = phrase.replace(/^(?:us|metric|imperial)\s+/i, "");
    if (/^[a-zA-Z.°\- ]+$/.test(candidate) && normalizeUnit(candidate).unit !== "unknown") {
      unit = candidate;
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

  // "Original" — scale the imported line, do not convert. Every member of a dual
  // annotation ("200g / 7 oz") scales, not just the first.
  if (opts.targetSystem === "original") {
    return { text: scaleAnnotatedText(ing.display_text, opts.scale), status: "original", approximate: false, sourceText };
  }
  const system = opts.targetSystem;

  // Reduce any pre-written multi-unit annotations ("200g / 7 oz") to the chosen
  // system BEFORE parsing, so the whole line reflects the selection rather than
  // showing every unit. Everything below works on this reduced text.
  const displayText = reduceMeasurementGroups(ing.display_text, system === "us" ? "us" : "metric");
  const scaled = () => scaleIngredientText(displayText, opts.scale);

  // A leading "N × M<unit>" multiplier ("2 x 125g") is a COUNT of items with a
  // per-item size. The count has no unit of its own, so never pair it with the
  // per-item unit. Instead: scale the count with portions, and convert the
  // per-item part ("125g" → US "4½ oz") on its own. Metric keeps "2 x 125g".
  const mult = displayText.match(/^\s*(\d+(?:\.\d+)?)\s*[×x]\s*(.+)$/i);
  if (mult) {
    const perItem = renderIngredientAmount(
      { display_text: mult[2], name: null, unit: null, quantity_value: null, quantity_min: null, quantity_max: null, preparation: ing.preparation },
      { scale: 1, targetSystem: system, sourceRegion: opts.sourceRegion },
    );
    const count = formatQuantityValue(Number(mult[1]) * opts.scale);
    return { text: `${count} x ${perItem.text}`, status: perItem.status, approximate: perItem.approximate, sourceText };
  }

  // A leading article + number ("a 14 oz can tomatoes") is a COUNT of a fixed-
  // size package, not an amount to convert — converting would treat the article
  // "1" as "1 oz" (→ 28 g). Leave the line to the text scaler.
  if (/^\s*an?\s+\d/i.test(displayText)) {
    return { text: scaled(), status: "fallback_text_scaling", approximate: false, sourceText };
  }

  // A pre-written dual annotation ("200g / 7 oz", or two "/"-groups joined by
  // "or") was already reduced to the target system above, so the author's own
  // target amount is in hand. Scale THAT text (every "or" alternative included)
  // rather than recomputing from the structured value — recomputing would
  // override the author's rounding (at 2×, "14 oz" would drift to "14⅛ oz").
  if (displayText !== ing.display_text) {
    return { text: scaleAnnotatedText(displayText, opts.scale), status: "converted", approximate: false, sourceText };
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
  let approximate = false;
  let assumedPrep: string | undefined;
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

    // DENSITY (Phase 3): a dry ingredient measured by VOLUME, viewed in Metric, is
    // shown by WEIGHT — a metric baker weighs flour; "250 ml flour" is useless. Only
    // on a STRICT density-profile match for the ingredient name; otherwise the
    // volume stays a volume. US keeps cups. Always approximate (cup packing varies).
    const densityProfile = dimension === "volume" && system === "metric" ? findDensityProfile(name) : null;
    if (densityProfile) {
      const gml = gramsPerMl(densityProfile);
      const gramsLo = canon.convertedQuantity * gml;
      const gramsHi = canon.convertedQuantityMax != null ? canon.convertedQuantityMax * gml : undefined;
      const massUnit = selectSystemUnit(Math.max(gramsLo, gramsHi ?? gramsLo), "weight", system);
      result = convert({ quantity: gramsLo, quantityMax: gramsHi, fromUnit: "g", toUnit: massUnit, sourceRegion: SYSTEM_REGION[system] });
      approximate = true;
      assumedPrep = densityProfile.assumedPreparationLabel;
    } else {
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
  }

  if (result.error || result.convertedQuantity == null || result.convertedUnit == null) {
    return fallback("unsupported_conversion");
  }

  // No unit change ⇒ already in the target unit.
  if (result.convertedUnit === norm.unit) {
    // A temperature is a SETTING, never scaled; same unit ⇒ same scale, so keep
    // the source temperature text verbatim (never "60°C" → "120°C" at 2×).
    if (dimension === "temperature") {
      return { text: displayText, status: "converted", approximate: false, sourceText };
    }
    // Grams-stay-grams etc.: keep the ORIGINAL formatting rather than reflowing
    // "50g" → "50 g". But a region-sensitive unit whose code is unchanged (metric
    // cup → US cup) still changed VALUE (250 ml vs 236 ml), and a structured range
    // needs proper formatting — both must fall through to render the real value.
    if (!isRegionSensitive(norm.unit) && max == null) {
      return { text: scaled(), status: "converted", approximate: false, sourceText };
    }
  }

  // A weight too small for the target unit (0.1 g → 0 oz) would render "0" and
  // vanish — keep the source unit so a real quantity is not erased.
  if (roundDisplay(result.convertedQuantity) === 0 && result.convertedQuantity !== 0) {
    return { text: scaled(), status: "converted", approximate: false, sourceText };
  }

  const amount = formatConverted(result);
  // Retain a leading quantity modifier ("about", "roughly") on the converted
  // amount — dropping it would present a hedged amount as exact.
  const modifier = displayText.match(LEADING_MODIFIER)?.[0]?.trim();
  const amountText = modifier ? `${modifier} ${amount}` : amount;
  // Preserve a separate preparation field ("toasted") — a cooking instruction.
  const prep = ing.preparation?.trim();
  const namePart = name && prep ? `${name}, ${prep}` : name || prep || "";
  const text = namePart ? `${amountText} ${namePart}` : amountText;
  const note = approximate ? `Approximate weight${assumedPrep ? ` — assumes ${assumedPrep}` : ""}.` : undefined;
  return { text, status: "converted", approximate, note, sourceText };
}
