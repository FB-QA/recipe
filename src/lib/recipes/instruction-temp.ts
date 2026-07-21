import { convert, type MeasurementSystem, type MeasurementUnit } from "@/lib/measurements";

/**
 * Display-time conversion of oven-temperature EXPRESSIONS inside method text.
 * Recognises whole expressions — single (`180°C`, `180 C`, `180C`, `5°C`,
 * `350 degrees Fahrenheit`), ranges (`180–200°C`, `180 to 200°C`), dual-scale
 * equivalents (`180°C (350°F)`, `180°C / 350°F`, `Gas Mark 4 / 350°F`) and gas
 * marks — and converts them as a unit, so a range's endpoints never split scales
 * and a dual never contradicts itself. Returns a NEW string for display only; the
 * stored instruction is never modified, and an unsupported expression is left
 * entirely unchanged. Spec §29 (Phase 2 scope).
 */

type ConcreteSystem = Exclude<MeasurementSystem, "original">;

const GAS_FRACTIONS: Record<string, number> = { "¼": 0.25, "½": 0.5, "¾": 0.75 };

function gasValue(token: string): number {
  return GAS_FRACTIONS[token] ?? Number(token);
}

const symbol = (u: MeasurementUnit): string => (u === "fahrenheit" ? "°F" : "°C");
const scaleOf = (token: string): MeasurementUnit => (token[0].toLowerCase() === "f" ? "fahrenheit" : "celsius");
/** Parse a captured number, normalising a Unicode minus to ASCII. */
const num = (s: string): number => Number(s.replace(/−/g, "-"));

// Oven dials move in 25°F / 5°C steps, but ONLY within real oven ranges. Outside
// them (boiling water, warm liquids, freezer temps) that stepping distorts the
// value — 100°C → 212°F must NOT snap to 200°F — so round to the whole degree.
const OVEN_BAND_F: readonly [number, number] = [250, 550];
const OVEN_BAND_C: readonly [number, number] = [120, 290];

// Two cross-scale temps are the same setting if they land within this many °F of
// each other (a rounding artifact); a full oven dial step (25°F) is not.
const DUAL_EQUIV_TOLERANCE_F = 15;

/** Convert one temperature to a number, rounded to oven-dial steps in the oven band. */
function convertTempNum(value: number, from: MeasurementUnit, to: MeasurementUnit): number | null {
  const r = convert({ quantity: value, fromUnit: from, toUnit: to });
  if (r.error || r.convertedQuantity == null) return null;
  const c = r.convertedQuantity;
  const [lo, hi] = to === "fahrenheit" ? OVEN_BAND_F : OVEN_BAND_C;
  const inOvenBand = Math.abs(c) >= lo && Math.abs(c) <= hi;
  const step = inOvenBand ? (to === "fahrenheit" ? 25 : 5) : 1;
  return Math.round(c / step) * step;
}

function convertTemp(value: number, from: MeasurementUnit, to: MeasurementUnit): string | null {
  const n = convertTempNum(value, from, to);
  return n == null ? null : `${n}${symbol(to)}`;
}

// A single temperature. NUMBER: 2–3 digits (a degree sign optional, so "180C"
// works), OR a single digit that MUST carry a degree sign — "5°C" converts, but
// "5 c sugar" (cups) does not. The leading (?<![\d.]) boundary stops a decimal
// tail ("37.50°C") matching its "50" as a fresh temperature. UNIT accepts a
// symbol, the word "degree(s)", or nothing, before c / f / celsius / fahrenheit.
const NUM = String.raw`(?<![\d.])([-−]?\d{2,3}|[-−]?\d(?=\s*°))`;
const UNIT = String.raw`\s*(?:°|degrees?)?\s*(celsius|fahrenheit|[cf])\b`;
const TEMP = NUM + UNIT;

export function convertInstructionTemps(text: string, system: ConcreteSystem): string {
  const toUnit: MeasurementUnit = system === "us" ? "fahrenheit" : "celsius";
  let out = text;

  // Collapse a two-temp expression to a single value ONLY when the two are
  // genuine opposite-scale EQUIVALENTS (e.g. "180°C (350°F)") — never a
  // contradictory "180°C (175°C)". Same-scale alternatives ("180°C or 200°C")
  // and mismatched cross-scale values ("180°C or 450°F", "180°C (375°F)" — a
  // full dial step apart) are NOT equivalents: return the match unchanged so the
  // single-temp pass converts each endpoint independently and neither disappears.
  const collapseDual = (m: string, n1: string, u1: string, n2: string, u2: string): string => {
    const s1 = scaleOf(u1);
    const s2 = scaleOf(u2);
    if (s1 === s2) return m; // same scale → two distinct settings, not equivalents
    // Compare BOTH endpoints in Fahrenheit — its finer granularity cleanly
    // separates a rounding artifact (a true pair like 350°F/180°C → 0°F apart)
    // from a real one-dial-step difference (180°C/375°F → 25°F apart), which a
    // Celsius comparison blurs (5°C rounding vs a 10°C step).
    const f1 = convertTempNum(num(n1), s1, "fahrenheit");
    const f2 = convertTempNum(num(n2), s2, "fahrenheit");
    if (f1 == null || f2 == null || Math.abs(f1 - f2) >= DUAL_EQUIV_TOLERANCE_F) return m;
    // Genuine equivalents → keep the single value already in the target scale.
    if (s1 === toUnit) return `${n1}${symbol(toUnit)}`;
    if (s2 === toUnit) return `${n2}${symbol(toUnit)}`;
    return convertTemp(num(n1), s1, toUnit) ?? m;
  };
  out = out.replace(new RegExp(`${TEMP}\\s*\\(\\s*${TEMP}\\s*\\)`, "gi"), collapseDual);
  out = out.replace(new RegExp(`${TEMP}\\s*(?:\\/|\\bor\\b)\\s*${TEMP}`, "gi"), collapseDual);

  // Gas-mark dual ("Gas Mark 4 / 350°F", "Gas Mark 4 (350°F)"): the temp pass
  // can't see the gas mark, so without this the two are converted independently
  // into a contradiction ("180°C / 175°C"). A gas mark and its paired temp are
  // equivalents — collapse to the single target-scale value off the gas mark.
  out = out.replace(
    new RegExp(
      String.raw`gas\s*mark\s*(¼|½|¾|\d+)\s*(?:\(\s*|\/\s*|\bor\b\s*)([-−]?\d{2,3})\s*(?:°|degrees?)?\s*(?:celsius|fahrenheit|[cf])\b\s*\)?`,
      "gi",
    ),
    (m, g) => convertTemp(gasValue(g), "gas_mark", toUnit) ?? m,
  );

  // Ranges — both endpoints convert together (never a mixed "180–400°F"), across
  // a dash or the word "to". The first endpoint takes an optional sign so a
  // negative range ("-20–-10°C") keeps it instead of stranding a stray "-".
  out = out.replace(
    new RegExp(String.raw`(?<![\d.])([-−]?\d{2,3})\s*(–|—|-|\bto\b)\s*([-−]?\d{2,3})\s*(?:°|degrees?)?\s*(celsius|fahrenheit|[cf])\b`, "gi"),
    (m, a, sep, b, u) => {
      const from = scaleOf(u);
      if (from === toUnit) return m;
      const lo = convertTempNum(num(a), from, toUnit);
      const hi = convertTempNum(num(b), from, toUnit);
      if (lo == null || hi == null) return m;
      const sepOut = /to/i.test(sep) ? " to " : "–";
      return `${lo}${sepOut}${hi}${symbol(toUnit)}`;
    },
  );

  // Single temperatures.
  out = out.replace(new RegExp(TEMP, "gi"), (m, n, u) => {
    const from = scaleOf(u);
    if (from === toUnit) return m;
    return convertTemp(num(n), from, toUnit) ?? m;
  });

  // Gas marks (source only). The lookaheads refuse a dash-range ("Gas Mark 4–5"),
  // a spaced ASCII fraction ("Gas Mark 4 1/2") and a trailing glyph fraction
  // ("Gas Mark 4½"); an off-table decimal is captured whole and left unchanged by
  // convertTemp — never a partial "180°C.5" or "180°C 1/2".
  out = out.replace(
    /gas\s*mark\s*(¼|½|¾|\d+(?:\.\d+)?)(?!\s*[–—-]\s*\d)(?!\s+\d+\s*\/\s*\d+)(?![¼½¾])/gi,
    (m, g) => convertTemp(gasValue(g), "gas_mark", toUnit) ?? m,
  );

  return out;
}
