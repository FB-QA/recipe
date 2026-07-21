import { parseQuantity, formatQuantityValue, UNICODE_FRACTION_CHARS } from "@/lib/measurements";

/** Pull the base portion count out of a free-text servings field ("2 large
 *  portions" → 2). Null when there's no number to scale from. */
export function parseServings(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(/\d+(?:\.\d+)?/);
  const n = m ? parseFloat(m[0]) : null;
  return n && n > 0 ? n : null;
}

/** Parse a single leading-quantity token — delegates to the measurement parser. */
const parseQtyToken = (token: string): number | null => parseQuantity(token).value;

const FRAC = String.raw`[${UNICODE_FRACTION_CHARS}]`;
// Leading quantity, longest form first so a mixed number matches whole:
// "1½" / "1 ½", "1 1/2", "1/2", "1.5" / "1", or a bare unicode fraction.
const QTY = String.raw`\d+\s*${FRAC}|\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?|${FRAC}`;
const QTY_RE = new RegExp(`(${QTY})`);
// A leading RANGE: two quantities joined by a dash or "to" ("1–2", "1 to 2"),
// optionally after a modifier ("about 1–2") which is preserved.
const RANGE_MOD = String.raw`(?:about|approximately|approx|roughly|around|up\s+to)`;
const RANGE_RE = new RegExp(String.raw`^(\s*(?:${RANGE_MOD}\s+)?)(${QTY})(\s*(?:[–—-]|\bto\b)\s*)(${QTY})`, "i");

/**
 * Scale a quantity in an ingredient line by `factor`. A leading RANGE scales
 * BOTH endpoints ("1–2 tbsp" → "2–4 tbsp"); otherwise only the FIRST number is
 * scaled — deliberate, so "2 x 125g chicken" scales the count (→ "4 x 125g"),
 * not the per-item weight. Lines with no number are returned unchanged.
 */
export function scaleIngredientText(text: string, factor: number): string {
  if (!Number.isFinite(factor) || factor === 1) return text;

  const range = text.match(RANGE_RE);
  if (range) {
    const lo = parseQtyToken(range[2]);
    const hi = parseQtyToken(range[4]);
    if (lo != null && hi != null) {
      return range[1] + formatQuantityValue(lo * factor) + range[3] + formatQuantityValue(hi * factor) + text.slice(range[0].length);
    }
  }

  return text.replace(QTY_RE, (match) => {
    const value = parseQtyToken(match);
    if (value == null) return match;
    return formatQuantityValue(value * factor);
  });
}
