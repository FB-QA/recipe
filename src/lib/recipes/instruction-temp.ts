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

/** Convert one temperature and round to oven-dial increments (°F→25, °C→5). */
function convertTemp(value: number, from: MeasurementUnit, to: MeasurementUnit): string | null {
  const r = convert({ quantity: value, fromUnit: from, toUnit: to });
  if (r.error || r.convertedQuantity == null) return null;
  const step = to === "fahrenheit" ? 25 : 5;
  const rounded = Math.round(r.convertedQuantity / step) * step;
  return `${rounded}°${to === "fahrenheit" ? "F" : "C"}`;
}

export function convertInstructionTemps(text: string, system: ConcreteSystem): string {
  const toUnit: MeasurementUnit = system === "us" ? "fahrenheit" : "celsius";
  let out = text;

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

  // Gas marks (source only — never a conversion target).
  out = out.replace(/gas\s*mark\s*(¼|½|¾|\d+)/gi, (m, g) => {
    return convertTemp(gasValue(g), "gas_mark", toUnit) ?? m;
  });

  return out;
}
