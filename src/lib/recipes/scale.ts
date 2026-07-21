/** Pull the base portion count out of a free-text servings field ("2 large
 *  portions" → 2). Null when there's no number to scale from. */
export function parseServings(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(/\d+(?:\.\d+)?/);
  const n = m ? parseFloat(m[0]) : null;
  return n && n > 0 ? n : null;
}

const UNICODE_FRACTIONS: Record<string, number> = {
  "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};

function parseQtyToken(token: string): number | null {
  const t = token.trim();
  if (UNICODE_FRACTIONS[t] != null) return UNICODE_FRACTIONS[t];
  if (t.includes("/")) {
    const [a, b] = t.split("/").map((s) => parseFloat(s.trim()));
    return b ? a / b : null;
  }
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

const NICE_FRACTIONS: Array<[number, string]> = [
  [0, ""], [0.125, "⅛"], [0.25, "¼"], [1 / 3, "⅓"], [0.5, "½"], [2 / 3, "⅔"], [0.75, "¾"], [0.875, "⅞"],
];

/** Format a scaled amount tidily — whole numbers stay whole, near-common
 *  fractions render as ½, 1¼ etc., otherwise fall back to ≤2 decimals. */
export function formatAmount(n: number): string {
  if (n <= 0) return "0";
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  for (const [value, symbol] of NICE_FRACTIONS) {
    if (Math.abs(frac - value) < 0.04) {
      if (symbol === "") return String(whole);
      return whole === 0 ? symbol : `${whole}${symbol}`;
    }
  }
  return String(Number(n.toFixed(2)));
}

// Leading quantity: a fraction (a/b), a decimal/integer, or a unicode fraction.
const QTY = String.raw`\d+\s*\/\s*\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]`;
const QTY_RE = new RegExp(`(${QTY})`);
// A leading RANGE: two quantities joined by a dash or "to" ("1–2", "1 to 2").
const RANGE_RE = new RegExp(String.raw`^(\s*)(${QTY})(\s*(?:[–—-]|\bto\b)\s*)(${QTY})`);

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
      return range[1] + formatAmount(lo * factor) + range[3] + formatAmount(hi * factor) + text.slice(range[0].length);
    }
  }

  return text.replace(QTY_RE, (match) => {
    const value = parseQtyToken(match);
    if (value == null) return match;
    return formatAmount(value * factor);
  });
}
