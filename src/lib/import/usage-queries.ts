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
  if (f.resolver) imports = imports.filter((i) => i.accepted_resolver_id === f.resolver);
  if (f.provider || f.model) {
    imports = imports.filter((i) =>
      rows.ai.some(
        (a) => a.recipe_import_id === i.id && (!f.provider || a.provider_id === f.provider) && (!f.model || a.model_id === f.model),
      ),
    );
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
    resolvers: [...new Set(rows.imports.map((i) => i.accepted_resolver_id).filter((v): v is string => Boolean(v)))].sort(),
    providers: [...new Set(rows.ai.map((a) => a.provider_id))].sort(),
    models: [...new Set(rows.ai.map((a) => a.model_id))].sort(),
  };
}
