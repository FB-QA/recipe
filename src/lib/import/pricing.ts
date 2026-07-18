/**
 * Money maths — ADR-1/ADR-2.
 * Unit prices are integer nano-USD per unit; computed costs are integer
 * micro-USD, round-half-up per component at attempt write time. No float
 * ever touches money.
 */

export interface PriceRow {
  provider_id: string;
  service_id: string;
  model_id: string;
  unit_type: string;
  price_per_unit_nano_usd: number;
}

/** ADR-2 overflow guard: beyond this, cost degrades to 'estimated'. */
export const UNITS_GUARD = 1_000_000_000;

/**
 * cost_micro_usd = (units × price_nano + 500) div 1000, integer arithmetic.
 * `capped` signals the ADR-2 guard fired — callers record
 * cost_accuracy='estimated' for that component.
 */
export function unitCostMicroUsd(
  units: number,
  priceNanoUsd: number,
): { costMicroUsd: number; capped: boolean } {
  const capped = units > UNITS_GUARD;
  const u = Math.min(Math.max(0, Math.floor(units)), UNITS_GUARD);
  const costMicroUsd = Math.floor((u * Math.floor(priceNanoUsd) + 500) / 1000);
  return { costMicroUsd, capped };
}

/**
 * R6/ADR-9 price selection: exact model match first, then the '*' wildcard.
 * Null when no row matches — a missing price never blocks an import; the
 * attempt is recorded with cost 0 and cost_accuracy='none'.
 */
export function pickPrice(rows: PriceRow[], modelId: string | null, unitType: string): PriceRow | null {
  const ofType = rows.filter((r) => r.unit_type === unitType);
  return (
    ofType.find((r) => modelId !== null && r.model_id === modelId) ??
    ofType.find((r) => r.model_id === "*") ??
    null
  );
}
