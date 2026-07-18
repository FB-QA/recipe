import { describe, expect, it } from "vitest";
import { computeUsage, formatMicroUsd, type UsageRows } from "./usage";

const NOW = new Date("2026-07-18T12:00:00Z").getTime();
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 24 * 3600 * 1000).toISOString();

const rows: UsageRows = {
  imports: [
    // website, deterministic (no AI), success, today
    { id: "w1", state: "ready_for_review", source_kind: "website", failure_reason: null, accepted_resolver_id: "website_direct", quality_score: 95, total_cost_micro_usd: 0, created_at: iso(0) },
    // instagram, direct + apify cover + AI, success, 3 days ago
    { id: "i1", state: "ready_for_review", source_kind: "instagram_reel", failure_reason: null, accepted_resolver_id: "instagram_direct", quality_score: 88, total_cost_micro_usd: 8739, created_at: iso(3) },
    // instagram, failed (manual fallback), 10 days ago
    { id: "i2", state: "failed", source_kind: "instagram_post", failure_reason: "insufficient_content", accepted_resolver_id: null, quality_score: null, total_cost_micro_usd: 0, created_at: iso(10) },
    // paste, AI, success, 40 days ago (outside 30d)
    { id: "p1", state: "saved", source_kind: "pasted_text", failure_reason: null, accepted_resolver_id: "pasted_text", quality_score: 90, total_cost_micro_usd: 6039, created_at: iso(40) },
  ],
  retrieval: [
    { recipe_import_id: "w1", resolver_id: "website_direct", provider_id: null, service_id: null, status: "succeeded", evidence_status: "complete", cost_micro_usd: 0, created_at: iso(0) },
    { recipe_import_id: "i1", resolver_id: "gemini_url_context", provider_id: "google", service_id: "url_context", status: "unavailable", evidence_status: "unavailable", cost_micro_usd: 0, created_at: iso(3) },
    { recipe_import_id: "i1", resolver_id: "instagram_direct", provider_id: null, service_id: null, status: "succeeded", evidence_status: "partial", cost_micro_usd: 0, created_at: iso(3) },
    { recipe_import_id: "i1", resolver_id: "apify_cover", provider_id: "apify", service_id: "instagram_scraper", status: "succeeded", evidence_status: "complete", cost_micro_usd: 2700, created_at: iso(3) },
    { recipe_import_id: "i2", resolver_id: "instagram_direct", provider_id: null, service_id: null, status: "succeeded", evidence_status: "partial", cost_micro_usd: 0, created_at: iso(10) },
  ],
  ai: [
    { recipe_import_id: "i1", purpose: "initial", provider_id: "anthropic", model_id: "claude-haiku-4-5", status: "succeeded", total_cost_micro_usd: 6039, created_at: iso(3) },
    { recipe_import_id: "p1", purpose: "initial", provider_id: "anthropic", model_id: "claude-haiku-4-5", status: "succeeded", total_cost_micro_usd: 6039, created_at: iso(40) },
  ],
};

describe("computeUsage — cost windows and totals (AC1)", () => {
  const u = computeUsage(rows, NOW);
  it("sums cost across the right windows", () => {
    expect(u.costToday).toBe(0);           // only w1 today, cost 0
    expect(u.cost7d).toBe(8739);           // w1 + i1
    expect(u.cost30d).toBe(8739);          // p1 (40d) excluded
    expect(u.costLifetime).toBe(14778);    // + p1
  });
  it("uses the all-time lifetime override for the Lifetime card, leaving windows windowed", () => {
    const withLifetime = computeUsage(rows, NOW, 999_999);
    expect(withLifetime.costLifetime).toBe(999_999); // all-time total, not the windowed sum
    expect(withLifetime.cost7d).toBe(8739);          // window figures unchanged
    expect(withLifetime.categories.total).toBe(14778); // category total reconciles to the window
    // Averages must stay in the windowed scope — NOT lifetime / windowed-count.
    expect(withLifetime.avgCostPerImport).toBe(Math.round(14778 / 4));
    expect(withLifetime.costPerSuccess).toBe(Math.round(14778 / 3));
  });
  it("counts imports and successes and derives averages", () => {
    expect(u.importCount).toBe(4);
    expect(u.successCount).toBe(3);        // w1, i1, p1 (i2 failed)
    expect(u.avgCostPerImport).toBe(Math.round(14778 / 4));
    expect(u.costPerSuccess).toBe(Math.round(14778 / 3));
  });
  it("breaks cost into the right categories", () => {
    expect(u.categories.apify).toBe(2700);
    expect(u.categories.recipeExtraction).toBe(12078); // two initial AI attempts
    expect(u.categories.directRetrieval).toBe(0);
    expect(u.categories.retry).toBe(0);
    expect(u.categories.total).toBe(14778);
  });
});

describe("computeUsage — Instagram panel (AC2)", () => {
  const u = computeUsage(rows, NOW);
  it("reports the resolver funnel for Instagram imports", () => {
    expect(u.instagram.attempted).toBe(2);           // i1, i2
    expect(u.instagram.directPartial).toBe(2);        // both direct partial
    expect(u.instagram.urlContextAttempted).toBe(0);  // gemini was unavailable
    expect(u.instagram.apifyCalls).toBe(1);           // i1 cover enrichment call was made
    // i1's only Apify attempt is cover enrichment (not a source fallback) and i2
    // never called Apify — so BOTH avoided source fallback, and the fallback rate is 0.
    expect(u.instagram.apifyAvoided).toBe(2);
    expect(u.apifyFallbackRate).toBe(0);
    expect(u.instagram.manualFallback).toBe(1);       // i2 failed
  });
});

describe("computeUsage — rates and per-source (AC1/AC3 data)", () => {
  const u = computeUsage(rows, NOW);
  it("success rate by source", () => {
    const web = u.successRateBySource.find((s) => s.source === "website");
    expect(web).toMatchObject({ total: 1, success: 1, rate: 1 });
    const igPost = u.successRateBySource.find((s) => s.source === "instagram_post");
    expect(igPost).toMatchObject({ total: 1, success: 0, rate: 0 });
  });
  it("quality by resolver route", () => {
    const direct = u.qualityByResolver.find((q) => q.resolver === "instagram_direct");
    expect(direct).toMatchObject({ avgQuality: 88, count: 1 });
  });
  it("no-AI imports counted (deterministic website)", () => {
    expect(u.noAiImports).toBeGreaterThanOrEqual(1);
  });
});

describe("formatMicroUsd", () => {
  it("formats sub-cent and dollar amounts", () => {
    expect(formatMicroUsd(0)).toBe("$0");
    expect(formatMicroUsd(2700)).toBe("$0.0027");
    expect(formatMicroUsd(6039)).toBe("$0.0060");
    expect(formatMicroUsd(1_230_000)).toBe("$1.23");
  });
});
