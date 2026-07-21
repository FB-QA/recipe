import { type NextRequest, NextResponse, after } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { importConfig } from "@/lib/import/config";
import {
  readById,
  loadPrices,
  createImportStore,
  applyEnrichedCover,
  nextRetrievalAttemptNumber,
  hasCoverEnrichmentAttempt,
} from "@/lib/import/store";
import { createApifyResolver } from "@/lib/import/resolvers/apify";
import { enrichImportCover, shouldEnrichCover } from "@/lib/import/enrich-cover";
import type { RecipeImportSourceType } from "@/lib/import/schema";

/**
 * Deferred Reel cover enrichment (spec: docs/spec/defer-cover-enrichment.md). The
 * import now returns the preview with the play-button composite cover; the review
 * screen calls this to swap in Apify's clean cover in the background. A route
 * handler (not a server action) so the client can `abort()` it on save — the
 * abort is threaded into the Apify call, so an early save genuinely cancels it and
 * keeps the composite. Auth-gated by the proxy middleware; user-scoped here too.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ coverUrl: null }, { status: 401 });

  const row = await readById(user.id, id);
  if (!row) return NextResponse.json({ coverUrl: null }, { status: 404 });

  // Cheap early-out — skip the price/ledger/Apify work entirely when there is
  // nothing to enrich: no Apify token configured, or the shared predicate says no
  // (switch off, cover already clean, import saved, or not an Instagram composite).
  const config = importConfig();
  const currentCover = row.extracted?.source?.coverImageUrl ?? null;
  if (!config.apifyToken || !shouldEnrichCover(row, config.reelCoverEnrich)) {
    return NextResponse.json({ coverUrl: currentCover });
  }

  // At-most-once per import. A failed run leaves the cover composite, so the predicate
  // above stays true; without this, reopening the review would start (and pay for)
  // another Apify run every time. A prior apify_cover ledger row — success or failure
  // — means we've already spent our one attempt.
  if (await hasCoverEnrichmentAttempt(id)) {
    return NextResponse.json({ coverUrl: currentCover });
  }

  const prices = await loadPrices();
  const store = createImportStore(prices);
  // No caller signal: the run is NOT cancelled when the client navigates away on
  // save — one we have already paid to start finishes, and `applyEnrichedCover`
  // lands its clean image on the import (still in review) or the saved recipe.
  const resolver = createApifyResolver();
  const attemptNumber = await nextRetrievalAttemptNumber(id);

  // One enrichment, awaited twice: `after()` keeps it (and its apply) alive past a
  // client disconnect; the synchronous await returns the clean cover for the live
  // review preview. Same promise → a single Apify run either way.
  const enrichment = enrichImportCover({
    enabled: config.reelCoverEnrich,
    row,
    prices,
    store,
    resolver,
    request: {
      sourceKind: (row.source_kind ?? "instagram_reel") as RecipeImportSourceType,
      url: row.source_url,
      text: null,
      userId: user.id,
      importId: id,
    },
    attemptNumber,
    onComplete: (coverUrl, cost) => applyEnrichedCover(user.id, id, coverUrl, cost),
  }).catch(() => ({ coverUrl: null as string | null }));

  after(() => enrichment);
  const { coverUrl } = await enrichment;
  return NextResponse.json({ coverUrl: coverUrl ?? currentCover });
}
