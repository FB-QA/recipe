import { describe, expect, it } from "vitest";
import { applyFilters, filterOptions } from "./usage-queries";
import type { UsageRows } from "./usage";

const rows: UsageRows = {
  imports: [
    { id: "a", state: "ready_for_review", source_kind: "website", failure_reason: null, accepted_resolver_id: "website_direct", quality_score: 95, total_cost_micro_usd: 0, created_at: "2026-07-18T00:00:00Z" },
    { id: "b", state: "failed", source_kind: "instagram_reel", failure_reason: "login_wall_detected", accepted_resolver_id: null, quality_score: null, total_cost_micro_usd: 0, created_at: "2026-07-18T00:00:00Z" },
    { id: "c", state: "ready_for_review", source_kind: "pasted_text", failure_reason: null, accepted_resolver_id: "pasted_text", quality_score: 90, total_cost_micro_usd: 515, created_at: "2026-07-18T00:00:00Z" },
  ],
  retrieval: [
    { recipe_import_id: "a", resolver_id: "website_direct", provider_id: null, service_id: null, status: "succeeded", evidence_status: "complete", cost_micro_usd: 0, created_at: "2026-07-18T00:00:00Z" },
    { recipe_import_id: "c", resolver_id: "pasted_text", provider_id: null, service_id: null, status: "succeeded", evidence_status: "complete", cost_micro_usd: 0, created_at: "2026-07-18T00:00:00Z" },
  ],
  ai: [
    { recipe_import_id: "c", purpose: "initial", provider_id: "google", model_id: "gemini-3.1-flash-lite", status: "succeeded", total_cost_micro_usd: 515, created_at: "2026-07-18T00:00:00Z" },
  ],
};

describe("applyFilters — filters keep the row set consistent (AC3)", () => {
  it("filters by source kind and drops orphaned attempts", () => {
    const out = applyFilters(rows, { sinceDays: 365, sourceKind: "pasted_text" });
    expect(out.imports.map((i) => i.id)).toEqual(["c"]);
    expect(out.ai).toHaveLength(1);
    expect(out.retrieval.every((r) => r.recipe_import_id === "c")).toBe(true);
  });

  it("filters by failure reason", () => {
    const out = applyFilters(rows, { sinceDays: 365, failureReason: "login_wall_detected" });
    expect(out.imports.map((i) => i.id)).toEqual(["b"]);
  });

  it("filters by provider/model via the AI attempts", () => {
    const out = applyFilters(rows, { sinceDays: 365, model: "gemini-3.1-flash-lite" });
    expect(out.imports.map((i) => i.id)).toEqual(["c"]);
    const none = applyFilters(rows, { sinceDays: 365, model: "claude-haiku-4-5" });
    expect(none.imports).toHaveLength(0);
  });
});

describe("filterOptions — distinct dropdown values", () => {
  it("lists the present sources, states, providers and models", () => {
    const o = filterOptions(rows);
    expect(o.sources).toContain("instagram_reel");
    expect(o.models).toEqual(["gemini-3.1-flash-lite"]);
    expect(o.providers).toEqual(["google"]);
  });
});
