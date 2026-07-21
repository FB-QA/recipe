import { convert, type MeasurementSystem, type MeasurementUnit } from "@/lib/measurements";

/**
 * Display-time conversion of explicit oven-temperature patterns inside method
 * text — `180°C`, `350°F`, `Gas Mark 4`. It returns a NEW string for display
 * only; the stored instruction is never modified, and no character-span
 * annotations are persisted (that's Phase 5). Deliberately narrow: only clear
 * degree/gas-mark patterns, nothing speculative.
 */

type ConcreteSystem = Exclude<MeasurementSystem, "original">;

const GAS_FRACTIONS: Record<string, number> = { "¼": 0.25, "½": 0.5, "¾": 0.75 };

function gasValue(token: string): number {
  return GAS_FRACTIONS[token] ?? Number(token);
}

const symbol = (u: MeasurementUnit): string => (u === "fahrenheit" ? "°F" : "°C");

/** Convert one temperature to a number, rounded to oven-dial increments. */
function convertTempNum(value: number, from: MeasurementUnit, to: MeasurementUnit): number | null {
  const r = convert({ quantity: value, fromUnit: from, toUnit: to });
  if (r.error || r.convertedQuantity == null) return null;
  const step = to === "fahrenheit" ? 25 : 5;
  return Math.round(r.convertedQuantity / step) * step;
}

/** Convert one temperature to a display string ("175°C"). */
function convertTemp(value: number, from: MeasurementUnit, to: MeasurementUnit): string | null {
  const n = convertTempNum(value, from, to);
  return n == null ? null : `${n}${symbol(to)}`;
}

export function convertInstructionTemps(text: string, system: ConcreteSystem): string {
  const toUnit: MeasurementUnit = system === "us" ? "fahrenheit" : "celsius";
  let out = text;

  // Dual-scale equivalents first — "180°C (350°F)" must collapse to the single
  // target-scale value, never become a contradictory "180°C (175°C)".
  out = out.replace(/(\d{2,3})\s*°\s*([CF])\s*\(\s*(\d{2,3})\s*°\s*([CF])\s*\)/gi, (m, n1, u1, n2, u2) => {
    const want = toUnit === "fahrenheit" ? "F" : "C";
    if (u1.toUpperCase() === want) return `${n1}°${want}`;
    if (u2.toUpperCase() === want) return `${n2}°${want}`;
    return convertTemp(Number(n1), u1.toUpperCase() === "F" ? "fahrenheit" : "celsius", toUnit) ?? m;
  });

  // Temperature RANGES first, so both endpoints convert together — never a
  // mixed-scale "180–400°F". Run before the single-value passes consume them.
  out = out.replace(/(\d{2,3})\s*[–—-]\s*(\d{2,3})\s*°\s*F\b/gi, (m, a, b) => {
    if (toUnit === "fahrenheit") return m;
    const lo = convertTempNum(Number(a), "fahrenheit", toUnit);
    const hi = convertTempNum(Number(b), "fahrenheit", toUnit);
    return lo != null && hi != null ? `${lo}–${hi}${symbol(toUnit)}` : m;
  });
  out = out.replace(/(\d{2,3})\s*[–—-]\s*(\d{2,3})\s*°\s*C\b/gi, (m, a, b) => {
    if (toUnit === "celsius") return m;
    const lo = convertTempNum(Number(a), "celsius", toUnit);
    const hi = convertTempNum(Number(b), "celsius", toUnit);
    return lo != null && hi != null ? `${lo}–${hi}${symbol(toUnit)}` : m;
  });

  // Fahrenheit sources (run first so a °C→°F insertion isn't re-scanned).
  out = out.replace(/(\d{2,3})\s*°\s*F\b/gi, (m, n) => {
    if (toUnit === "fahrenheit") return m;
    return convertTemp(Number(n), "fahrenheit", toUnit) ?? m;
  });

  // Celsius sources.
  out = out.replace(/(\d{2,3})\s*°\s*C\b/gi, (m, n) => {
    if (toUnit === "celsius") return m;
    return convertTemp(Number(n), "celsius", toUnit) ?? m;
  });

  // Gas marks (source only). The lookahead refuses a dash-range ("Gas Mark
  // 4–5") so a half-match can't leave "180°C–5"; a decimal like "4.5" is
  // captured whole and, being off-table, is left unchanged by convertTemp.
  out = out.replace(/gas\s*mark\s*(¼|½|¾|\d+(?:\.\d+)?)(?!\s*[–—-]\s*\d)/gi, (m, g) => {
    return convertTemp(gasValue(g), "gas_mark", toUnit) ?? m;
  });

  return out;
}
