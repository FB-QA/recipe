/**
 * Admin usage aggregation (spec §24). The ledgers are small (thousands of rows,
 * architecture R9), so rows are fetched for the window and reduced in JS — no
 * indexes, no heavy SQL. `computeUsage` is pure and unit-tested; the fetch layer
 * (service-role, admin-gated) lives in `usage-queries.ts`.
 */

import { IMPORT_STATES } from "./schema";

export interface ImportRowLite {
  id: string;
  state: string | null;
  source_kind: string | null;
  failure_reason: string | null;
  accepted_resolver_id: string | null;
  quality_score: number | null;
  total_cost_micro_usd: number;
  created_at: string;
}

export interface RetrievalAttemptLite {
  recipe_import_id: string;
  resolver_id: string;
  provider_id: string | null;
  service_id: string | null;
  status: string;
  evidence_status: string | null;
  cost_micro_usd: number;
  created_at: string;
}

export interface AiAttemptLite {
  recipe_import_id: string;
  purpose: string;
  provider_id: string;
  model_id: string;
  status: string;
  total_cost_micro_usd: number;
  created_at: string;
}

export interface UsageRows {
  imports: ImportRowLite[];
  retrieval: RetrievalAttemptLite[];
  ai: AiAttemptLite[];
}

const SUCCESS_STATES = new Set(["ready_for_review", "saved"]);
const DAY = 24 * 3600 * 1000;

function withinWindow(iso: string, nowMs: number, ms: number): boolean {
  return nowMs - new Date(iso).getTime() <= ms;
}

export interface CostCategories {
  directRetrieval: number;
  urlContext: number;
  apify: number;
  recipeExtraction: number;
  correction: number;
  retry: number;
  total: number;
}

export interface InstagramPanel {
  attempted: number;
  directSucceeded: number;
  directPartial: number;
  urlContextAttempted: number;
  urlContextSucceeded: number;
  apifyCalls: number;
  apifyAvoided: number;
  manualFallback: number;
  avgTotalCostMicroUsd: number;
}

export interface UsageSummary {
  costToday: number;
  cost7d: number;
  cost30d: number;
  costLifetime: number;
  importCount: number;
  successCount: number;
  avgCostPerImport: number;
  costPerSuccess: number;
  noAiImports: number;
  categories: CostCategories;
  directSuccessRate: number;
  urlContextSuccessRate: number;
  apifyFallbackRate: number;
  userFallbackRate: number;
  successRateBySource: Array<{ source: string; total: number; success: number; rate: number }>;
  qualityByResolver: Array<{ resolver: string; avgQuality: number; count: number }>;
  instagram: InstagramPanel;
}

function ratio(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

export function computeUsage(rows: UsageRows, nowMs: number, lifetimeCostMicroUsd?: number): UsageSummary {
  const { imports, retrieval, ai } = rows;

  // Cost windows use each import's accumulated total (every attempt cost folds
  // into total_cost_micro_usd via the pipeline's CAS deltas). `costWindow` is the
  // total over the fetched (filtered/windowed) rows; the Lifetime card takes an
  // all-time total when supplied, so a short selected window doesn't shrink it.
  const costWindow = imports.reduce((s, i) => s + i.total_cost_micro_usd, 0);
  const costLifetime = lifetimeCostMicroUsd ?? costWindow;
  const costToday = imports.filter((i) => withinWindow(i.created_at, nowMs, DAY)).reduce((s, i) => s + i.total_cost_micro_usd, 0);
  const cost7d = imports.filter((i) => withinWindow(i.created_at, nowMs, 7 * DAY)).reduce((s, i) => s + i.total_cost_micro_usd, 0);
  const cost30d = imports.filter((i) => withinWindow(i.created_at, nowMs, 30 * DAY)).reduce((s, i) => s + i.total_cost_micro_usd, 0);

  const importCount = imports.length;
  const successCount = imports.filter((i) => i.state && SUCCESS_STATES.has(i.state)).length;
  const noAiImports = imports.filter((i) => i.state === "ai_not_required").length +
    imports.filter((i) => !ai.some((a) => a.recipe_import_id === i.id)).filter((i) => i.state && SUCCESS_STATES.has(i.state)).length;

  // Per-category cost.
  const categories: CostCategories = {
    directRetrieval: retrieval.filter((r) => r.provider_id === null).reduce((s, r) => s + r.cost_micro_usd, 0),
    urlContext: retrieval.filter((r) => r.service_id === "url_context").reduce((s, r) => s + r.cost_micro_usd, 0),
    apify: retrieval.filter((r) => r.provider_id === "apify").reduce((s, r) => s + r.cost_micro_usd, 0),
    recipeExtraction: ai.filter((a) => a.purpose === "initial").reduce((s, a) => s + a.total_cost_micro_usd, 0),
    correction: ai.filter((a) => a.purpose === "correction").reduce((s, a) => s + a.total_cost_micro_usd, 0),
    retry: ai.filter((a) => a.purpose === "retry").reduce((s, a) => s + a.total_cost_micro_usd, 0),
    // Category totals are over the windowed rows, so their sum reconciles here —
    // not against the all-time Lifetime figure.
    total: costWindow,
  };

  // Resolver route success rates. Direct-fetch success tracks Instagram direct
  // retrieval reliability (it feeds IG routing/cost decisions); website_direct is
  // near-always successful via JSON-LD and would mask a failing instagram_direct.
  const directAttempts = retrieval.filter((r) => r.resolver_id === "instagram_direct");
  const directSuccessRate = ratio(directAttempts.filter((r) => r.status === "succeeded").length, directAttempts.length);
  const urlContextAttempts = retrieval.filter((r) => r.service_id === "url_context" && r.status !== "unavailable");
  // A URL-context "success" means it produced complete evidence — a "succeeded"
  // attempt whose evidence was only partial still forced a fallthrough, so it
  // must not count as a success for provider-routing decisions.
  const urlContextSuccessRate = ratio(
    urlContextAttempts.filter((r) => r.status === "succeeded" && r.evidence_status === "complete").length,
    urlContextAttempts.length,
  );

  // Instagram panel.
  const igImports = imports.filter((i) => i.source_kind?.startsWith("instagram"));
  const igIds = new Set(igImports.map((i) => i.id));
  const igRetrieval = retrieval.filter((r) => igIds.has(r.recipe_import_id));
  const igDirect = igRetrieval.filter((r) => r.resolver_id === "instagram_direct");
  const igUrlCtx = igRetrieval.filter((r) => r.service_id === "url_context");
  const igApify = igRetrieval.filter((r) => r.provider_id === "apify" && r.status !== "unavailable");
  // Cover enrichment (`apify_cover`) runs AFTER direct retrieval already accepted
  // the caption — it is not a source fallback, so it must not inflate the fallback
  // rate or the "avoided" count. Only source-fallback Apify calls count for those.
  const igApifySource = igApify.filter((r) => r.resolver_id !== "apify_cover");
  const igApifySourceImports = new Set(igApifySource.map((r) => r.recipe_import_id)).size;
  const manualFallback = igImports.filter((i) => i.state === "failed").length;
  const instagram: InstagramPanel = {
    attempted: igImports.length,
    directSucceeded: igDirect.filter((r) => r.status === "succeeded" && r.evidence_status === "complete").length,
    directPartial: igDirect.filter((r) => r.evidence_status === "partial").length,
    urlContextAttempted: igUrlCtx.filter((r) => r.status !== "unavailable").length,
    urlContextSucceeded: igUrlCtx.filter((r) => r.status === "succeeded" && r.evidence_status === "complete").length,
    apifyCalls: igApify.length,
    apifyAvoided: igImports.length - igApifySourceImports,
    manualFallback,
    avgTotalCostMicroUsd: Math.round(ratio(igImports.reduce((s, i) => s + i.total_cost_micro_usd, 0), igImports.length)),
  };

  const apifyFallbackRate = ratio(igApifySourceImports, igImports.length);
  const userFallbackRate = ratio(manualFallback, igImports.length);

  // Success rate by source type.
  const sources = [...new Set(imports.map((i) => i.source_kind ?? "unknown"))];
  const successRateBySource = sources.map((source) => {
    const set = imports.filter((i) => (i.source_kind ?? "unknown") === source);
    const success = set.filter((i) => i.state && SUCCESS_STATES.has(i.state)).length;
    return { source, total: set.length, success, rate: ratio(success, set.length) };
  });

  // Quality score by accepted resolver route.
  const resolvers = [...new Set(imports.map((i) => i.accepted_resolver_id).filter((r): r is string => Boolean(r)))];
  const qualityByResolver = resolvers.map((resolver) => {
    const set = imports.filter((i) => i.accepted_resolver_id === resolver && i.quality_score !== null);
    const avgQuality = set.length ? Math.round(set.reduce((s, i) => s + (i.quality_score ?? 0), 0) / set.length) : 0;
    return { resolver, avgQuality, count: set.length };
  });

  return {
    costToday, cost7d, cost30d, costLifetime,
    importCount, successCount,
    avgCostPerImport: Math.round(ratio(costLifetime, importCount)),
    costPerSuccess: Math.round(ratio(costLifetime, successCount)),
    noAiImports,
    categories,
    directSuccessRate, urlContextSuccessRate, apifyFallbackRate, userFallbackRate,
    successRateBySource, qualityByResolver,
    instagram,
  };
}

/** micro-USD → a compact "$0.0027" / "$1.23" money string. */
export function formatMicroUsd(micro: number): string {
  const dollars = micro / 1_000_000;
  if (dollars === 0) return "$0";
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  if (dollars < 1) return `$${dollars.toFixed(3)}`;
  return `$${dollars.toFixed(2)}`;
}

/** The valid state values, for the filter UI. */
export const ALL_IMPORT_STATES = IMPORT_STATES;
