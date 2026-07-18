/**
 * Full end-to-end verification against the LOCAL Supabase stack: claim →
 * pipeline → real Claude extraction → attempt ledgers + state machine + cost,
 * read straight back from the database. Throwaway harness.
 *
 *   npx tsx --tsconfig tsconfig.json --env-file=.env --env-file=.env.local scripts/verify-import-e2e.mts
 */
import { importConfig } from "@/lib/import/config";
import { buildResolverChain, selectPrimaryProvider } from "@/lib/import/registry";
import { runImportPipeline } from "@/lib/import/engine";
import { claimImport, createImportStore, loadPrices, readByIdempotencyKey } from "@/lib/import/store";
import { createServiceClient } from "@/lib/supabase/server";

const USER = "5a7e123a-9d3d-4ee8-9aa2-3c55bc3cc56a";
const line = (s: string) => console.log(s);

const TEXT = `Roasted Strawberry Cheesecake Pots
Serves 4. Prep 20 min, cook 15 min.
For the base:
- 1-2 tbsp melted butter
- 6 digestive biscuits, crushed
For the topping:
- 400g strawberries, hulled
- 15-20g toasted pecans OR 1 extra digestive biscuit
- 200g cream cheese
- 2 tbsp honey (optional)
Method:
1. Roast the strawberries at 200C for 15 min.
2. Mix biscuits and butter, press into pots.
3. Whip cream cheese with honey, layer, top, chill 1 hour.`;

async function main() {
  const key = crypto.randomUUID();
  const config = importConfig();
  line(`config: provider=${config.primaryProvider} model=${config.primaryModel} apify=${config.apifyToken ? "yes" : "no"} google=${config.googleApiKey ? "yes" : "no"}`);

  // W1 claim.
  const claim = await claimImport({ userId: USER, idempotencyKey: key, sourceKind: "pasted_text", sourceUrl: null });
  if (claim.raced) return line("✗ unexpected race on first claim");
  line(`\n✓ W1 claim → import ${claim.importId}`);

  // Idempotency: a second claim with the same key must lose the race (AC6).
  const dup = await claimImport({ userId: USER, idempotencyKey: key, sourceKind: "pasted_text", sourceUrl: null });
  line(`✓ AC6 duplicate claim raced=${dup.raced} (must be true)`);

  // Run the real pipeline.
  const prices = await loadPrices();
  const chain = buildResolverChain({ sourceKind: "pasted_text", url: null, text: TEXT, userId: USER, importId: claim.importId }, config);
  const provider = selectPrimaryProvider(config);
  const store = createImportStore(prices);
  const outcome = await runImportPipeline(
    { sourceKind: "pasted_text", url: null, text: TEXT, userId: USER, importId: claim.importId },
    { config, chain, provider, store },
  );
  line(`\npipeline outcome: ${outcome.kind}${outcome.kind === "ready" ? ` quality=${outcome.qualityScore}` : ` reason=${outcome.failureReason}`}`);

  // Read the persisted truth back.
  const row = await readByIdempotencyKey(USER, key);
  line(`\n=== recipe_imports row ===`);
  line(`  state=${row?.state} quality=${row?.quality_score} total_cost_micro_usd=${row?.total_cost_micro_usd}`);
  line(`  extracted present: ${row?.extracted ? "yes" : "no"}, title="${row?.extracted?.title}"`);
  line(`  ingredient groups: ${row?.extracted?.ingredientGroups.map((g) => g.name ?? "(unnamed)").join(", ")}`);

  const db = createServiceClient() as unknown as {
    from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: unknown[] | null }> } };
  };
  const ai = await db.from("ai_extraction_attempts").select("purpose,status,total_cost_micro_usd,model_id,input_text_tokens,output_tokens_total").eq("recipe_import_id", claim.importId);
  line(`\n=== ai_extraction_attempts (${ai.data?.length ?? 0}) ===`);
  for (const a of ai.data ?? []) line(`  ${JSON.stringify(a)}`);
  const ret = await db.from("source_retrieval_attempts").select("resolver_id,status,unit_type,cost_micro_usd,cost_accuracy,evidence_status").eq("recipe_import_id", claim.importId);
  line(`\n=== source_retrieval_attempts (${ret.data?.length ?? 0}) ===`);
  for (const r of ret.data ?? []) line(`  ${JSON.stringify(r)}`);

  line("\nDone.");
}

await main();
