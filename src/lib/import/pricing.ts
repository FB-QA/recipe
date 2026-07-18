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
 * Scoped by (provider, service, unit) because the same model/unit can carry
 * different rates under different services (e.g. google/messages vs
 * google/url_context) — without that scoping a URL-context attempt could be
 * charged the extraction rate and vice-versa. Null when no row matches — a
 * missing price never blocks an import (cost 0, accuracy 'none').
 */
export function pickPrice(
  rows: PriceRow[],
  providerId: string,
  serviceId: string,
  modelId: string | null,
  unitType: string,
): PriceRow | null {
  const scoped = rows.filter(
    (r) => r.provider_id === providerId && r.service_id === serviceId && r.unit_type === unitType,
  );
  return (
    scoped.find((r) => modelId !== null && r.model_id === modelId) ??
    scoped.find((r) => r.model_id === "*") ??
    null
  );
}
