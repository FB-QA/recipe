import { convert, type MeasurementSystem, type MeasurementUnit } from "@/lib/measurements";

/**
 * Display-time conversion of oven-temperature EXPRESSIONS inside method text.
 * Recognises whole expressions — single (`180°C`, `180 C`, `180C`), ranges
 * (`180–200°C`), dual-scale equivalents (`180°C (350°F)`, `180°C / 350°F`,
 * `180°C or 350°F`) and gas marks — and converts them as a unit, so a range's
 * endpoints never split scales and a dual never contradicts itself. Returns a
 * NEW string for display only; the stored instruction is never modified, and an
 * unsupported expression is left entirely unchanged. Spec §29 (Phase 2 scope).
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

// Oven dials move in ~25°F / ~5°C steps, but only in oven range; below it
// (freezer/chill temps) a finer 5° step keeps the −40°C/−40°F crossover exact.
const OVEN_MIN_FAHRENHEIT = 200;
const OVEN_STEP_FAHRENHEIT = 25;
const FINE_STEP = 5;

/** Convert one temperature to a number, rounded to oven-dial increments. */
function convertTempNum(value: number, from: MeasurementUnit, to: MeasurementUnit): number | null {
  const r = convert({ quantity: value, fromUnit: from, toUnit: to });
  if (r.error || r.convertedQuantity == null) return null;
  const c = r.convertedQuantity;
  const step = to === "fahrenheit" && Math.abs(c) >= OVEN_MIN_FAHRENHEIT ? OVEN_STEP_FAHRENHEIT : FINE_STEP;
  return Math.round(c / step) * step;
}

function convertTemp(value: number, from: MeasurementUnit, to: MeasurementUnit): string | null {
  const n = convertTempNum(value, from, to);
  return n == null ? null : `${n}${symbol(to)}`;
}

// A single temperature: optional sign (freezer temps), 2–3 digits, optional
// degree, a scale word/letter. The 2–3 digit floor keeps "2 fresh eggs" and
// "50 g" from ever matching.
const TEMP = String.raw`([-−]?\d{2,3})\s*°?\s*(celsius|fahrenheit|[cf])\b`;

export function convertInstructionTemps(text: string, system: ConcreteSystem): string {
  const toUnit: MeasurementUnit = system === "us" ? "fahrenheit" : "celsius";
  let out = text;

  // Collapse a two-temp expression to a single value ONLY when the two are
  // genuine opposite-scale EQUIVALENTS (e.g. "180°C (350°F)") — never a
  // contradictory "180°C (175°C)". Same-scale alternatives ("180°C or 200°C")
  // and mismatched cross-scale values ("180°C or 450°F") are NOT equivalents:
  // return the match unchanged so the single-temp pass converts each endpoint
  // independently and neither value disappears.
  const collapseDual = (m: string, n1: string, u1: string, n2: string, u2: string): string => {
    const s1 = scaleOf(u1);
    const s2 = scaleOf(u2);
    if (s1 === s2) return m; // same scale → two distinct settings, not equivalents
    const n1AsS2 = convertTempNum(num(n1), s1, s2);
    const tol = s2 === "fahrenheit" ? OVEN_STEP_FAHRENHEIT : FINE_STEP;
    if (n1AsS2 == null || Math.abs(n1AsS2 - num(n2)) > tol) return m; // not equivalent
    // Genuine equivalents → keep the single value already in the target scale.
    if (s1 === toUnit) return `${n1}${symbol(toUnit)}`;
    if (s2 === toUnit) return `${n2}${symbol(toUnit)}`;
    return convertTemp(num(n1), s1, toUnit) ?? m;
  };
  out = out.replace(new RegExp(`${TEMP}\\s*\\(\\s*${TEMP}\\s*\\)`, "gi"), collapseDual);
  out = out.replace(new RegExp(`${TEMP}\\s*(?:\\/|\\bor\\b)\\s*${TEMP}`, "gi"), collapseDual);

  // Ranges — both endpoints convert together (never a mixed "180–400°F"). The
  // endpoints require a degree/space before the dash so "-18°C" is not read as
  // an open range.
  out = out.replace(new RegExp(String.raw`(\d{2,3})\s*[–—-]\s*([-−]?\d{2,3})\s*°?\s*(celsius|fahrenheit|[cf])\b`, "gi"), (m, a, b, u) => {
    const from = scaleOf(u);
    if (from === toUnit) return m;
    const lo = convertTempNum(num(a), from, toUnit);
    const hi = convertTempNum(num(b), from, toUnit);
    return lo != null && hi != null ? `${lo}–${hi}${symbol(toUnit)}` : m;
  });

  // Single temperatures.
  out = out.replace(new RegExp(TEMP, "gi"), (m, n, u) => {
    const from = scaleOf(u);
    if (from === toUnit) return m;
    return convertTemp(num(n), from, toUnit) ?? m;
  });

  // Gas marks (source only). The lookahead refuses a dash-range ("Gas Mark
  // 4–5", "Gas Mark 4.5–5"); an off-table decimal is captured whole and left
  // unchanged by convertTemp — never a partial "180°C.5".
  out = out.replace(/gas\s*mark\s*(¼|½|¾|\d+(?:\.\d+)?)(?!\s*[–—-]\s*\d)(?![¼½¾])/gi, (m, g) => {
    return convertTemp(gasValue(g), "gas_mark", toUnit) ?? m;
  });

  return out;
}
