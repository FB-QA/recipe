/**
 * Live end-to-end for Reel cover enrichment: run the real pipeline for a Reel,
 * with the real Apify enricher, and confirm the saved cover is the clean
 * (non-composite) image and the extra call is costed. One Apify + one Claude call.
 */
import { importConfig } from "@/lib/import/config";
import { buildResolverChain, selectPrimaryProvider } from "@/lib/import/registry";
import { runImportPipeline } from "@/lib/import/engine";
import { claimImport, createImportStore, loadPrices, readByIdempotencyKey } from "@/lib/import/store";
import { createApifyResolver } from "@/lib/import/resolvers/apify";
import { createServiceClient } from "@/lib/supabase/server";
import { isCompositeReelCover } from "@/lib/import/config";
import type { ImportRequest } from "@/lib/import/schema";

const USER = "5a7e123a-9d3d-4ee8-9aa2-3c55bc3cc56a";
const URL = "https://www.instagram.com/p/DV9JHEbDZVd/";
const line = (s: string) => console.log(s);

async function main() {
  const key = crypto.randomUUID();
  const config = importConfig();
  const claim = await claimImport({ userId: USER, idempotencyKey: key, sourceKind: "instagram_reel", sourceUrl: URL });
  if (claim.raced) return line("raced");
  const request: ImportRequest = { sourceKind: "instagram_reel", url: URL, text: null, userId: USER, importId: claim.importId };

  const prices = await loadPrices();
  const store = createImportStore(prices);
  const out = await runImportPipeline(request, {
    config,
    chain: buildResolverChain(request, config),
    provider: selectPrimaryProvider(config),
    store,
    coverEnricher: config.apifyToken ? (req) => createApifyResolver().resolve(req, { previousEvidence: [] }) : undefined,
  });

  line(`outcome: ${out.kind}`);
  const row = await readByIdempotencyKey(USER, key);
  const cover = row?.extracted?.source.coverImageUrl ?? null;
  line(`cover: ${cover?.slice(0, 90)}`);
  line(`cover is composite (play button): ${isCompositeReelCover(cover)}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const { data } = await db.from("source_retrieval_attempts")
    .select("resolver_id,status,cost_micro_usd").eq("recipe_import_id", claim.importId);
  line("retrieval attempts:");
  for (const a of data ?? []) line(`  ${JSON.stringify(a)}`);

  const ok = out.kind === "ready" && cover !== null && !isCompositeReelCover(cover) &&
    (data ?? []).some((a: { resolver_id: string }) => a.resolver_id === "apify_cover");
  line(`\n${ok ? "✓ PASS" : "✗ FAIL"} — clean cover + costed apify_cover attempt`);

  await db.from("recipe_imports").delete().eq("id", claim.importId);
  line("(cleaned up)");
}

await main();
