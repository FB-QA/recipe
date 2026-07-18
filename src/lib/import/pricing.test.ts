import { describe, expect, it } from "vitest";
import { unitCostMicroUsd, pickPrice, UNITS_GUARD, type PriceRow } from "./pricing";

describe("unitCostMicroUsd — ADR-2 integer round-half-up", () => {
  it("computes Claude Haiku input cost exactly (1000 nano/token)", () => {
    // 12_345 tokens × 1000 nano = 12_345_000 nano = 12_345 micro-USD
    expect(unitCostMicroUsd(12_345, 1000)).toEqual({ costMicroUsd: 12_345, capped: false });
  });

  it("rounds half up per component, not banker's", () => {
    // 1 token × 500 nano = 0.5 micro → rounds up to 1
    expect(unitCostMicroUsd(1, 500).costMicroUsd).toBe(1);
    // 1 token × 499 nano = 0.499 micro → rounds down to 0
    expect(unitCostMicroUsd(1, 499).costMicroUsd).toBe(0);
    // 3 tokens × 100 nano (Gemini text) = 0.3 micro → 0
    expect(unitCostMicroUsd(3, 100).costMicroUsd).toBe(0);
    // 15 tokens × 100 nano = 1.5 micro → 2
    expect(unitCostMicroUsd(15, 100).costMicroUsd).toBe(2);
  });

  it("prices one Apify result at 2700 micro-USD", () => {
    expect(unitCostMicroUsd(1, 2_700_000).costMicroUsd).toBe(2700);
  });

  it("guards absurd unit counts and marks them capped (accuracy degrades to estimated)", () => {
    const r = unitCostMicroUsd(UNITS_GUARD + 1, 5000);
    expect(r.capped).toBe(true);
    // Still returns the guarded computation rather than NaN/overflow.
    expect(Number.isSafeInteger(r.costMicroUsd)).toBe(true);
  });

  it("returns zero for zero units", () => {
    expect(unitCostMicroUsd(0, 5000)).toEqual({ costMicroUsd: 0, capped: false });
  });
});

describe("pickPrice — ADR-9 exact model first, '*' wildcard fallback", () => {
  const rows: PriceRow[] = [
    { provider_id: "apify", service_id: "instagram_scraper", model_id: "*", unit_type: "result", price_per_unit_nano_usd: 2_700_000 },
    { provider_id: "anthropic", service_id: "messages", model_id: "claude-haiku-4-5", unit_type: "input_token", price_per_unit_nano_usd: 1000 },
  ];

  it("prefers the exact model row", () => {
    expect(pickPrice(rows, "claude-haiku-4-5", "input_token")?.price_per_unit_nano_usd).toBe(1000);
  });

  it("falls back to the wildcard row when no exact match", () => {
    expect(pickPrice(rows, "some-actor-version", "result")?.price_per_unit_nano_usd).toBe(2_700_000);
  });

  it("returns null when no row matches — a missing price never blocks an import (R6)", () => {
    expect(pickPrice(rows, "claude-haiku-4-5", "output_token")).toBeNull();
  });
});
