import { createServiceClient } from "@/lib/supabase/server";
import type { AiAttemptLite, ImportRowLite, RetrievalAttemptLite, UsageRows } from "./usage";

/**
 * Fetch + filter the ledgers for the admin dashboard (service-role; the tables
 * grant nothing to `authenticated`). Rows are small (architecture R9) so we pull
 * the window and filter in JS via the pure `applyFilters` — no per-filter SQL.
 */

export interface UsageFilters {
  sinceDays: number; // date window
  sourceKind?: string;
  state?: string;
  failureReason?: string;
  resolver?: string;
  provider?: string;
  model?: string;
}

const DAY = 24 * 3600 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any;

/** Server-side clock — kept out of the page component so the render stays pure. */
export function serverNowMs(): number {
  return Date.now();
}

export async function fetchUsageRows(sinceDays: number): Promise<UsageRows> {
  const db = createServiceClient() as unknown as Raw;
  const cutoff = new Date(Date.now() - sinceDays * DAY).toISOString();

  const [imports, retrieval, ai] = await Promise.all([
    db.from("recipe_imports")
      .select("id, state, source_kind, failure_reason, accepted_resolver_id, quality_score, total_cost_micro_usd, created_at")
      .not("state", "is", null)
      .gte("created_at", cutoff),
    db.from("source_retrieval_attempts")
      .select("recipe_import_id, resolver_id, provider_id, service_id, status, evidence_status, cost_micro_usd, created_at")
      .gte("created_at", cutoff),
    db.from("ai_extraction_attempts")
      .select("recipe_import_id, purpose, provider_id, model_id, status, total_cost_micro_usd, created_at")
      .gte("created_at", cutoff),
  ]);

  return {
    imports: (imports.data ?? []) as ImportRowLite[],
    retrieval: (retrieval.data ?? []) as RetrievalAttemptLite[],
    ai: (ai.data ?? []) as AiAttemptLite[],
  };
}

/**
 * All-time import cost, unbounded by the selected window — feeds the Lifetime
 * card so a short window (24h/7d) doesn't make lifetime spend appear to shrink.
 * Cheap: one narrow column across the small imports table (architecture R9).
 */
export async function fetchLifetimeCostMicroUsd(): Promise<number> {
  const db = createServiceClient() as unknown as Raw;
  const { data } = await db.from("recipe_imports").select("total_cost_micro_usd").not("state", "is", null);
  return ((data ?? []) as Array<{ total_cost_micro_usd: number }>).reduce(
    (s, r) => s + (r.total_cost_micro_usd ?? 0),
    0,
  );
}

/**
 * Narrow the fetched rows by the dashboard filters (pure, testable). Import-level
 * filters (source/state/failure/resolver) drop imports; provider/model keep only
 * imports that have a matching AI attempt. Attempts are then kept for surviving
 * imports so every derived number stays consistent with the filtered set.
 */
export function applyFilters(rows: UsageRows, f: UsageFilters): UsageRows {
  let imports = rows.imports;
  if (f.sourceKind) imports = imports.filter((i) => i.source_kind === f.sourceKind);
  if (f.state) imports = imports.filter((i) => i.state === f.state);
  if (f.failureReason) imports = imports.filter((i) => i.failure_reason === f.failureReason);
  if (f.resolver) {
    const resolver = f.resolver;
    // Match the accepted route OR any import that merely ATTEMPTED this resolver,
    // so failed/fell-through direct/URL-context/Apify rungs can be isolated too.
    imports = imports.filter(
      (i) =>
        i.accepted_resolver_id === resolver ||
        rows.retrieval.some((r) => r.recipe_import_id === i.id && r.resolver_id === resolver),
    );
  }
  if (f.provider || f.model) {
    imports = imports.filter((i) => {
      const aiMatch = rows.ai.some(
        (a) => a.recipe_import_id === i.id && (!f.provider || a.provider_id === f.provider) && (!f.model || a.model_id === f.model),
      );
      // A provider filter also matches retrieval-only providers (Apify, Google
      // URL context), which never appear in AI attempts. `model` is AI-only.
      const retrievalMatch =
        !f.model && f.provider
          ? rows.retrieval.some((r) => r.recipe_import_id === i.id && r.provider_id === f.provider)
          : false;
      return aiMatch || retrievalMatch;
    });
  }
  const ids = new Set(imports.map((i) => i.id));
  return {
    imports,
    retrieval: rows.retrieval.filter((r) => ids.has(r.recipe_import_id)),
    ai: rows.ai.filter((a) => ids.has(a.recipe_import_id)),
  };
}

/** Distinct filter values present in the data, for the dropdowns. */
export function filterOptions(rows: UsageRows) {
  return {
    sources: [...new Set(rows.imports.map((i) => i.source_kind).filter((v): v is string => Boolean(v)))].sort(),
    states: [...new Set(rows.imports.map((i) => i.state).filter((v): v is string => Boolean(v)))].sort(),
    failures: [...new Set(rows.imports.map((i) => i.failure_reason).filter((v): v is string => Boolean(v)))].sort(),
    // Include attempted resolvers (not just accepted routes) so failed/fell-through
    // rungs are selectable in the dropdown.
    resolvers: [
      ...new Set([
        ...rows.imports.map((i) => i.accepted_resolver_id).filter((v): v is string => Boolean(v)),
        ...rows.retrieval.map((r) => r.resolver_id).filter((v): v is string => Boolean(v)),
      ]),
    ].sort(),
    // Include retrieval-only providers (Apify, Google URL context), not just AI providers.
    providers: [
      ...new Set([
        ...rows.ai.map((a) => a.provider_id),
        ...rows.retrieval.map((r) => r.provider_id).filter((v): v is string => Boolean(v)),
      ]),
    ].sort(),
    models: [...new Set(rows.ai.map((a) => a.model_id))].sort(),
  };
}
