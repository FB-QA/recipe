import { type NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { importConfig } from "@/lib/import/config";
import {
  readById,
  loadPrices,
  createImportStore,
  updateExtractedCover,
  nextRetrievalAttemptNumber,
} from "@/lib/import/store";
import { createApifyResolver } from "@/lib/import/resolvers/apify";
import { fetchInstagram } from "@/lib/import/apify";
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

  // Cheap early-out on the shared predicate — skip the price/ledger/Apify work
  // entirely when there is nothing to enrich (switch off, cover already clean,
  // import already saved, or not an Instagram composite).
  const config = importConfig();
  const currentCover = row.extracted?.source?.coverImageUrl ?? null;
  if (!shouldEnrichCover(row, config.reelCoverEnrich)) {
    return NextResponse.json({ coverUrl: currentCover });
  }

  const prices = await loadPrices();
  const store = createImportStore(prices);
  const resolver = createApifyResolver({ fetchInstagram: (url) => fetchInstagram(url, request.signal) });
  const attemptNumber = await nextRetrievalAttemptNumber(id);

  try {
    const result = await enrichImportCover({
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
      updateCover: (coverUrl, cost) => updateExtractedCover(user.id, id, coverUrl, cost),
    });
    return NextResponse.json(result);
  } catch {
    // Never surface a cosmetic-cover failure as an error to the client.
    return NextResponse.json({ coverUrl: null });
  }
}
