import { describe, expect, it, vi } from "vitest";
import { runImportPipeline, type EngineDeps, type ImportStore } from "./engine";
import type { ResolverChain } from "./registry";
import type { PriceRow } from "./pricing";
import type {
  AiExtractedRecipe,
  ImportRequest,
  ProviderExtractionResult,
  RecipeExtractionProvider,
  SourceResolver,
  SourceResolverResult,
} from "./schema";
import { EMPTY_USAGE } from "./schema";

// ---- fakes -------------------------------------------------------------

interface RetrievalRow { resolverId: string; status: string; costMicroUsd: number; unitType: string | null; evidenceStatus: string | null }
interface AiRow { purpose: string; status: string; totalCostMicroUsd: number; modelId: string; errorCode: string | null }

function fakeStore(prices: PriceRow[] = PRICES) {
  const retrieval: RetrievalRow[] = [];
  const ai: AiRow[] = [];
  const transitions: Array<{ expected: string; next: string; failureReason?: string | null; costDeltaMicroUsd?: number }> = [];
  let state = "created";

  const store: ImportStore = {
    prices,
    async openRetrievalAttempt(input) {
      retrieval.push({ resolverId: input.resolverId, status: input.status ?? "started", costMicroUsd: 0, unitType: null, evidenceStatus: null });
      return String(retrieval.length - 1);
    },
    async closeRetrievalAttempt(id, patch) {
      const row = retrieval[Number(id)];
      row.status = patch.status;
      row.costMicroUsd = patch.costMicroUsd;
      row.unitType = patch.unitType;
      row.evidenceStatus = patch.evidenceStatus;
    },
    async openAiAttempt(input) {
      ai.push({ purpose: input.purpose, status: "started", totalCostMicroUsd: 0, modelId: input.modelId, errorCode: null });
      return String(ai.length - 1);
    },
    async closeAiAttempt(id, patch) {
      const row = ai[Number(id)];
      row.status = patch.status;
      row.totalCostMicroUsd = patch.totalCostMicroUsd;
      row.errorCode = patch.errorCode;
    },
    async transition(input) {
      if (input.expected !== state) return false;
      transitions.push({ expected: input.expected, next: input.next, failureReason: input.failureReason, costDeltaMicroUsd: input.costDeltaMicroUsd });
      state = input.next;
      return true;
    },
  };
  return { store, retrieval, ai, transitions, currentState: () => state };
}

const PRICES: PriceRow[] = [
  { provider_id: "anthropic", service_id: "messages", model_id: "claude-haiku-4-5", unit_type: "input_token", price_per_unit_nano_usd: 1000 },
  { provider_id: "anthropic", service_id: "messages", model_id: "claude-haiku-4-5", unit_type: "output_token", price_per_unit_nano_usd: 5000 },
  { provider_id: "apify", service_id: "instagram_scraper", model_id: "*", unit_type: "result", price_per_unit_nano_usd: 2_700_000 },
];

const req: ImportRequest = { sourceKind: "website", url: "https://recipes.test/x", text: null, userId: "u1", importId: "imp1" };

function resolverReturning(result: Partial<SourceResolverResult> & { evidence: SourceResolverResult["evidence"] }, id = "stub"): SourceResolver {
  return {
    resolverId: id, providerId: null, serviceId: null,
    supports: () => true,
    resolve: vi.fn(async () => ({ cost: null, ...result }) as SourceResolverResult),
  };
}

function evidence(over: Partial<SourceResolverResult["evidence"]>): SourceResolverResult["evidence"] {
  return {
    sourceType: "website", sourceUrl: req.url, retrievalStatus: "partial",
    resolverId: "stub", resolverAttemptId: "", caption: null, title: null, creatorName: null,
    media: [], evidenceWarnings: [], contentFingerprint: null, retrievedAt: "2026-07-18T00:00:00Z",
    ...over,
  };
}

const RECIPE: AiExtractedRecipe = {
  extractionStatus: "recipe", title: "Orzo", description: null,
  servings: { value: 4, originalText: "4" }, nutrition: null, prepTimeMinutes: 10, cookTimeMinutes: 20, totalTimeMinutes: null,
  ingredientGroups: [{ temporaryId: "g0", name: null, position: 0, optional: false, ingredients: [
    { temporaryId: "i0", position: 0, originalText: "500g chicken", quantityText: "500g", quantityValue: 500, quantityMin: null, quantityMax: null, unit: "g", name: "chicken", preparation: null, optional: false, alternativeGroupId: null },
  ] }],
  steps: [{ position: 0, title: null, instruction: "Cook it.", ingredientGroupReferences: [] }],
  tips: [], servingSuggestions: [], warnings: [], missingFields: [],
};

function stubProvider(...results: ProviderExtractionResult[]): RecipeExtractionProvider {
  const queue = [...results];
  return {
    providerId: "anthropic", serviceId: "messages", modelId: "claude-haiku-4-5",
    supports: () => true,
    extract: vi.fn(async () => queue.shift()!),
  };
}

const noProvider = stubProvider();
const chainOf = (chain: SourceResolver[], gatedOut: ResolverChain["gatedOut"] = []): ResolverChain => ({ chain, gatedOut });
const baseDeps = (over: Partial<EngineDeps>): EngineDeps => ({
  config: { primaryProvider: "anthropic", primaryModel: "claude-haiku-4-5", replacementModel: null, fallbackEnabled: false, anthropicApiKey: "k", googleApiKey: undefined, apifyToken: undefined, planEnforcementEnabled: false, reelCoverEnrich: true },
  chain: chainOf([]), provider: noProvider, store: fakeStore().store,
  sleepImpl: async () => {}, now: () => 0, rand: () => 0,
  ...over,
});

// ---- tests -------------------------------------------------------------

describe("AC1 — deterministic JSON-LD spends no AI", () => {
  it("accepts a deterministicRecipe and records zero AI attempts", async () => {
    const f = fakeStore();
    const resolver = resolverReturning({ evidence: evidence({ retrievalStatus: "complete" }), deterministicRecipe: RECIPE });
    const out = await runImportPipeline(req, baseDeps({ chain: chainOf([resolver]), store: f.store }));
    expect(out.kind).toBe("ready");
    if (out.kind === "ready") expect(out.recipe.source.retrievalMethod).toBe("jsonld");
    expect(f.ai).toHaveLength(0);
    expect(f.currentState()).toBe("ready_for_review");
  });
});

describe("AC3 — Apify runs only after cheaper rungs fall short, and all attempts are recorded", () => {
  it("stops at the direct rung when it yields sufficient evidence — no Apify attempt", async () => {
    const f = fakeStore();
    const direct = resolverReturning({ evidence: evidence({ retrievalStatus: "complete", caption: "Ingredients: 500g chicken, 250g orzo. Method: brown, simmer 12 min." }) }, "instagram_direct");
    const apify = resolverReturning({ evidence: evidence({ retrievalStatus: "complete", caption: "should not run" }) }, "apify_instagram");
    await runImportPipeline({ ...req, sourceKind: "instagram_post" }, baseDeps({
      chain: chainOf([direct, apify]), provider: stubProvider({ ok: true, recipe: RECIPE, usage: EMPTY_USAGE }), store: f.store,
    }));
    expect((apify.resolve as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(f.retrieval.map((r) => r.resolverId)).toEqual(["instagram_direct"]);
  });

  it("falls through to Apify when the direct rung is insufficient, and prices the paid result", async () => {
    const f = fakeStore();
    const direct = resolverReturning({ evidence: evidence({ retrievalStatus: "unavailable", evidenceWarnings: ["login_wall_detected"] }), failure: "login_wall_detected" }, "instagram_direct");
    const apify: SourceResolver = {
      resolverId: "apify_instagram", providerId: "apify", serviceId: "instagram_scraper", supports: () => true,
      resolve: vi.fn(async () => ({ evidence: evidence({ retrievalStatus: "complete", caption: "Ingredients: 500g chicken, 250g orzo. Method: brown, simmer 12 min." }), cost: { providerId: "apify", serviceId: "instagram_scraper", unitsUsed: 1, unitType: "result", rawUsage: {} } }) as SourceResolverResult),
    };
    await runImportPipeline({ ...req, sourceKind: "instagram_post" }, baseDeps({
      chain: chainOf([direct, apify]), provider: stubProvider({ ok: true, recipe: RECIPE, usage: EMPTY_USAGE }), store: f.store,
    }));
    expect(f.retrieval.map((r) => r.resolverId)).toEqual(["instagram_direct", "apify_instagram"]);
    const apifyRow = f.retrieval[1];
    expect(apifyRow.unitType).toBe("result");
    expect(apifyRow.costMicroUsd).toBe(2_700); // 1 result × 2.7M nano ÷ 1000 = 2,700 micro-USD = $0.0027 = $2.70/1000
  });
});

describe("AC4 — retrieval failures never yield an accepted recipe, and are retrieval-domain", () => {
  it("a 'recipe in bio' caption fails as insufficient_content, spending no AI", async () => {
    const f = fakeStore();
    const direct = resolverReturning({ evidence: evidence({ retrievalStatus: "partial", caption: "Full recipe is in my bio! link in bio" }) }, "instagram_direct");
    const out = await runImportPipeline({ ...req, sourceKind: "instagram_post" }, baseDeps({ chain: chainOf([direct]), store: f.store }));
    expect(out).toEqual({ kind: "failed", failureReason: "insufficient_content" });
    expect(f.ai).toHaveLength(0);
  });

  it("a login wall fails as login_wall_detected (retrieval), not an AI error", async () => {
    const f = fakeStore();
    const direct = resolverReturning({ evidence: evidence({ retrievalStatus: "unavailable", evidenceWarnings: ["login_wall_detected"] }), failure: "login_wall_detected" }, "instagram_direct");
    const out = await runImportPipeline({ ...req, sourceKind: "instagram_post" }, baseDeps({ chain: chainOf([direct]), store: f.store }));
    expect(out).toEqual({ kind: "failed", failureReason: "login_wall_detected" });
  });
});

describe("AC7 — every attempt is costed; AC9 — gated rungs are recorded, not dropped", () => {
  it("records a gated-out Gemini rung as an unavailable attempt", async () => {
    const f = fakeStore();
    const direct = resolverReturning({ evidence: evidence({ retrievalStatus: "complete", caption: "Ingredients: 500g chicken, 250g orzo. Method: brown, simmer 12 min." }) }, "instagram_direct");
    await runImportPipeline({ ...req, sourceKind: "instagram_post" }, baseDeps({
      chain: chainOf([direct], [{ resolverId: "gemini_url_context", providerId: "google", serviceId: "url_context", reason: "no_google_api_key" }]),
      provider: stubProvider({ ok: true, recipe: RECIPE, usage: EMPTY_USAGE }), store: f.store,
    }));
    const gemini = f.retrieval.find((r) => r.resolverId === "gemini_url_context");
    expect(gemini?.status).toBe("unavailable");
    expect(gemini?.evidenceStatus).toBe("unavailable");
  });

  it("prices an AI extraction from the token usage block", async () => {
    const f = fakeStore();
    const direct = resolverReturning({ evidence: evidence({ retrievalStatus: "partial", caption: "500g chicken, 250g orzo. Method: brown, simmer 12 min." }) });
    await runImportPipeline(req, baseDeps({
      chain: chainOf([direct]),
      provider: stubProvider({ ok: true, recipe: RECIPE, usage: { ...EMPTY_USAGE, inputTextTokens: 1000, outputTokensTotal: 200, outputCandidateTokens: 200 } }),
      store: f.store,
    }));
    // 1000 input × 1000 nano ÷ 1000 = 1000 micro; 200 output × 5000 ÷ 1000 = 1000 micro → 2000 total
    expect(f.ai[0].totalCostMicroUsd).toBe(2000);
    expect(f.ai[0].status).toBe("succeeded");
  });
});

describe("AC8 — retry transient once-per-rule; correct schema-invalid exactly once", () => {
  it("retries a rate-limited provider then succeeds", async () => {
    const f = fakeStore();
    const direct = resolverReturning({ evidence: evidence({ retrievalStatus: "partial", caption: "500g chicken, 250g orzo. Method: brown, simmer 12 min." }) });
    const out = await runImportPipeline(req, baseDeps({
      chain: chainOf([direct]),
      provider: stubProvider(
        { ok: false, errorCode: "rate_limited", errorMessageSafe: "429", usage: EMPTY_USAGE },
        { ok: true, recipe: RECIPE, usage: EMPTY_USAGE },
      ),
      store: f.store,
    }));
    expect(out.kind).toBe("ready");
    expect(f.ai.map((a) => a.purpose)).toEqual(["initial", "retry"]);
  });

  it("issues exactly one correction on schema-invalid output, then fails if still invalid", async () => {
    const f = fakeStore();
    const direct = resolverReturning({ evidence: evidence({ retrievalStatus: "partial", caption: "500g chicken, 250g orzo. Method: brown, simmer 12 min." }) });
    const junk = { ok: true, recipe: { not: "a recipe shape" }, usage: EMPTY_USAGE } as ProviderExtractionResult;
    const out = await runImportPipeline(req, baseDeps({
      chain: chainOf([direct]),
      provider: stubProvider(junk, junk),
      store: f.store,
    }));
    expect(out).toEqual({ kind: "failed", failureReason: "ai_output_invalid" });
    expect(f.ai.map((a) => a.purpose)).toEqual(["initial", "correction"]);
  });

  it("does not retry a safety block", async () => {
    const f = fakeStore();
    const direct = resolverReturning({ evidence: evidence({ retrievalStatus: "partial", caption: "500g chicken, 250g orzo. Method: brown, simmer 12 min." }) });
    const out = await runImportPipeline(req, baseDeps({
      chain: chainOf([direct]),
      provider: stubProvider({ ok: false, errorCode: "safety_block", errorMessageSafe: "x", usage: EMPTY_USAGE }),
      store: f.store,
    }));
    expect(out).toEqual({ kind: "failed", failureReason: "ai_safety_block" });
    expect(f.ai).toHaveLength(1);
  });

  it("classifies not_a_recipe from the model status without inventing a draft", async () => {
    const f = fakeStore();
    // Caption clears the deterministic gate (has quantity + method signal), but
    // the model itself judges it not a recipe — the engine trusts that verdict.
    const direct = resolverReturning({ evidence: evidence({ retrievalStatus: "partial", caption: "500g of nostalgia, 2 cups of memories. Method: reminisce, then serve cold." }) });
    const notRecipe: AiExtractedRecipe = { ...RECIPE, extractionStatus: "not_recipe" };
    const out = await runImportPipeline(req, baseDeps({
      chain: chainOf([direct]),
      provider: stubProvider({ ok: true, recipe: notRecipe, usage: EMPTY_USAGE }),
      store: f.store,
    }));
    expect(out).toEqual({ kind: "failed", failureReason: "not_a_recipe" });
  });
});

describe("cost & ledger accounting (§23)", () => {
  const igCaption = "Ingredients: 500g chicken, 250g orzo. Method: brown, simmer 12 min.";

  it("folds a paid-but-failed AI extraction into the failed import total (3973)", async () => {
    const f = fakeStore();
    const direct = resolverReturning({ evidence: evidence({ retrievalStatus: "complete", caption: igCaption }) }, "instagram_direct");
    const notRecipe: AiExtractedRecipe = { ...RECIPE, extractionStatus: "not_recipe" };
    const provider = stubProvider({ ok: true, recipe: notRecipe, usage: { ...EMPTY_USAGE, inputTextTokens: 100, outputTokensTotal: 0 } });
    const out = await runImportPipeline({ ...req, sourceKind: "instagram_post" }, baseDeps({ chain: chainOf([direct]), provider, store: f.store }));
    expect(out.kind).toBe("failed");
    const failed = f.transitions.find((t) => t.next === "failed");
    expect(failed?.costDeltaMicroUsd).toBe(100); // 100 input tokens × 1000 nano ÷ 1000
  });

  it("folds failed paid retrievals into the failed import total (3977)", async () => {
    const f = fakeStore();
    // A paid rung returns insufficient evidence; the import fails but its cost counts.
    const paid: SourceResolver = {
      resolverId: "apify_instagram", providerId: "apify", serviceId: "instagram_scraper", supports: () => true,
      resolve: vi.fn(async () => ({ evidence: evidence({ retrievalStatus: "partial", caption: null }), cost: { providerId: "apify", serviceId: "instagram_scraper", unitsUsed: 1, unitType: "result", rawUsage: {} } }) as SourceResolverResult),
    };
    const out = await runImportPipeline({ ...req, sourceKind: "instagram_post" }, baseDeps({ chain: chainOf([paid]), store: f.store }));
    expect(out.kind).toBe("failed");
    const failed = f.transitions.find((t) => t.next === "failed");
    expect(failed?.costDeltaMicroUsd).toBe(2_700); // 1 result × 2.7M nano ÷ 1000
  });

  it("stops the chain on terminal private content — no paid fallback (90880)", async () => {
    const f = fakeStore();
    const direct = resolverReturning({ evidence: evidence({ retrievalStatus: "unavailable", evidenceWarnings: ["private_content"] }) }, "instagram_direct");
    const apify = resolverReturning({ evidence: evidence({ retrievalStatus: "complete", caption: igCaption }) }, "apify_instagram");
    const out = await runImportPipeline({ ...req, sourceKind: "instagram_post" }, baseDeps({ chain: chainOf([direct, apify]), store: f.store }));
    expect(out.kind).toBe("failed");
    expect(apify.resolve as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(f.retrieval.map((r) => r.resolverId)).toEqual(["instagram_direct"]);
  });

  it("ledgers every transient retry as its own attempt (90873)", async () => {
    const f = fakeStore();
    // Always retryable-fails → initial + MAX_TRANSIENT_RETRIES(2) = 3 attempt rows.
    const flaky: SourceResolver = {
      resolverId: "instagram_direct", providerId: null, serviceId: null, supports: () => true,
      resolve: vi.fn(async () => ({ evidence: evidence({ retrievalStatus: "unavailable" }), cost: null, failure: "source_timeout" }) as SourceResolverResult),
    };
    await runImportPipeline({ ...req, sourceKind: "instagram_post" }, baseDeps({ chain: chainOf([flaky]), store: f.store }));
    expect(f.retrieval.filter((r) => r.resolverId === "instagram_direct")).toHaveLength(3);
    expect((flaky.resolve as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(3);
  });

  it("prices URL-context by model across input, output and tool-use tokens (3974/55360/90871)", async () => {
    const f = fakeStore([
      { provider_id: "google", service_id: "url_context", model_id: "gemini-3.1-flash-lite", unit_type: "input_token", price_per_unit_nano_usd: 100 },
      { provider_id: "google", service_id: "url_context", model_id: "gemini-3.1-flash-lite", unit_type: "output_token", price_per_unit_nano_usd: 400 },
    ]);
    const urlctx: SourceResolver = {
      resolverId: "gemini_url_context", providerId: "google", serviceId: "url_context", supports: () => true,
      resolve: vi.fn(async () => ({ evidence: evidence({ retrievalStatus: "complete", caption: igCaption }), cost: { providerId: "google", serviceId: "url_context", modelId: "gemini-3.1-flash-lite", unitsUsed: 1300, unitType: "input_token", tokens: { inputTokens: 200, outputTokens: 100, toolUseTokens: 1000 }, rawUsage: {} } }) as SourceResolverResult),
    };
    await runImportPipeline({ ...req, sourceKind: "instagram_post" }, baseDeps({ chain: chainOf([urlctx]), provider: stubProvider({ ok: true, recipe: RECIPE, usage: EMPTY_USAGE }), store: f.store }));
    // (200 input + 1000 tool-use) × 100 ÷ 1000 = 120; 100 output × 400 ÷ 1000 = 40 → 160
    expect(f.retrieval[0].costMicroUsd).toBe(160);
  });

  it("falls back to the replacement provider on a terminal primary failure (826277)", async () => {
    const f = fakeStore();
    const direct = resolverReturning({ evidence: evidence({ retrievalStatus: "complete", caption: igCaption }) }, "instagram_direct");
    const primary = stubProvider({ ok: false, errorCode: "safety_block", errorMessageSafe: "declined", usage: EMPTY_USAGE });
    const replacement = stubProvider({ ok: true, recipe: RECIPE, usage: EMPTY_USAGE });
    const out = await runImportPipeline({ ...req, sourceKind: "instagram_post" }, baseDeps({
      chain: chainOf([direct]), provider: primary, replacementProvider: replacement, store: f.store,
    }));
    expect(out.kind).toBe("ready");
    expect(replacement.extract as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    expect(f.ai.map((a) => a.status)).toContain("succeeded"); // fallback attempt recorded
  });

  it("stops the pipeline when a state transition is lost to a concurrent poll (826276)", async () => {
    const f = fakeStore();
    // Simulate a stale-race: the source_retrieved CAS loses (row already failed).
    const realTransition = f.store.transition.bind(f.store);
    f.store.transition = async (input) => (input.next === "source_retrieved" ? false : realTransition(input));
    const direct = resolverReturning({ evidence: evidence({ retrievalStatus: "complete", caption: igCaption }) }, "instagram_direct");
    const provider = stubProvider({ ok: true, recipe: RECIPE, usage: EMPTY_USAGE });
    const out = await runImportPipeline({ ...req, sourceKind: "instagram_post" }, baseDeps({ chain: chainOf([direct]), provider, store: f.store }));
    expect(out).toEqual({ kind: "failed", failureReason: "unknown_error" });
    // No AI attempt was made against the already-finalized row.
    expect(f.ai).toHaveLength(0);
    expect(provider.extract as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("carries an earlier rung's cover into a later text-only winner (55374)", async () => {
    const f = fakeStore();
    const partialWithCover = resolverReturning(
      { evidence: evidence({ retrievalStatus: "partial", caption: "teaser", media: [{ id: "m0", position: 0, modality: "image", sourceUrl: "https://cdn/cover.jpg", mimeType: null, storagePath: null, width: null, height: null, durationSeconds: null }] }) },
      "instagram_direct",
    );
    const textOnly = resolverReturning({ evidence: evidence({ retrievalStatus: "complete", caption: igCaption }) }, "gemini_url_context");
    const out = await runImportPipeline({ ...req, sourceKind: "instagram_post" }, baseDeps({
      chain: chainOf([partialWithCover, textOnly]), provider: stubProvider({ ok: true, recipe: RECIPE, usage: EMPTY_USAGE }), store: f.store,
    }));
    expect(out.kind).toBe("ready");
    if (out.kind === "ready") expect(out.recipe.source.coverImageUrl).toBe("https://cdn/cover.jpg");
  });
});
