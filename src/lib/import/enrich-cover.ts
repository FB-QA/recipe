import { isCompositeReelCover } from "./config";
import { retrievalCost } from "./engine";
import type { ImportStore } from "./engine";
import type { PriceRow } from "./pricing";
import type { ImportRow } from "./store";
import type { ImportRequest, SourceResolver } from "./schema";

/** Resolver id for the deferred cover run in the retrieval ledger — one home, so the
 *  enrichment (writer) and the at-most-once ledger check (reader) can't disagree. */
export const APIFY_COVER_RESOLVER_ID = "apify_cover";

/**
 * The deferred Reel-cover enrichment (spec: docs/spec/defer-cover-enrichment.md).
 *
 * The main import now finishes with the play-button composite cover so the user
 * reaches the preview ~11s sooner; this runs afterwards, off the critical path,
 * to swap in Apify's clean cover. Pure and injected — the route handler wires the
 * real store, resolver and DB update; tests wire fakes.
 */
export interface CoverEnrichDeps {
  /** The `IMPORT_REEL_COVER_ENRICH` switch — when false, no paid request runs. */
  enabled: boolean;
  row: ImportRow;
  prices: PriceRow[];
  store: Pick<ImportStore, "openRetrievalAttempt" | "closeRetrievalAttempt">;
  resolver: Pick<SourceResolver, "resolve">;
  request: ImportRequest;
  /** Next attempt number in this import's retrieval ledger. */
  attemptNumber: number;
  /**
   * Called once the attempt is closed, with the clean cover (or null when the run
   * failed / returned another composite) and the cost incurred. Always invoked when
   * an attempt ran, so the cost reconciles with the ledger even without a new cover;
   * the real impl applies the cover to the import-in-review or the saved recipe.
   */
  onComplete: (coverUrl: string | null, costMicroUsd: number) => Promise<void>;
}

/**
 * The single rule for whether a deferred cover enrichment should run: the operator
 * switch (`IMPORT_REEL_COVER_ENRICH`) is on, it's an Instagram import still in
 * review, and its cover is the play-button composite. Anything else (disabled,
 * already clean, already saved, a website import) is a no-op — no Apify call, no
 * charge. Shared by the route's cheap early-out and the enrichment itself, so the
 * predicate lives in exactly one place.
 */
export function shouldEnrichCover(
  row: Pick<ImportRow, "state" | "source_kind" | "extracted">,
  enabled: boolean,
): boolean {
  const cover = row.extracted?.source?.coverImageUrl ?? null;
  return (
    enabled &&
    Boolean(row.source_kind?.startsWith("instagram")) &&
    row.state === "ready_for_review" &&
    isCompositeReelCover(cover)
  );
}

export async function enrichImportCover(deps: CoverEnrichDeps): Promise<{ coverUrl: string | null }> {
  const currentCover = deps.row.extracted?.source?.coverImageUrl ?? null;
  if (!shouldEnrichCover(deps.row, deps.enabled)) {
    return { coverUrl: currentCover };
  }

  const started = Date.now();
  const attemptId = await deps.store.openRetrievalAttempt({
    importId: deps.request.importId,
    userId: deps.request.userId,
    attemptNumber: deps.attemptNumber,
    resolverId: APIFY_COVER_RESOLVER_ID,
    providerId: "apify",
    serviceId: "instagram_scraper",
  });

  let result = null;
  try {
    result = await deps.resolver.resolve(deps.request, { previousEvidence: [] });
  } catch {
    result = null;
  }

  const cleanImage = result?.evidence.media.find((m) => m.modality === "image")?.sourceUrl ?? null;
  const usable = Boolean(cleanImage && !isCompositeReelCover(cleanImage));
  const cost = result?.cost
    ? retrievalCost(deps.prices, result)
    : { units: null, unitType: null, costMicroUsd: 0, accuracy: "none" as const };

  await deps.store.closeRetrievalAttempt(attemptId, {
    status: usable ? "succeeded" : "failed",
    failureReason: usable ? null : "source_retrieval_failed",
    responseStatus: null,
    contentType: null,
    contentBytes: null,
    captionRetrieved: false,
    mediaCount: result?.evidence.media.length ?? 0,
    postType: "reel",
    evidenceStatus: result?.evidence.retrievalStatus ?? "unavailable",
    providerRequestId: null,
    externalRunId: result?.externalRunId ?? null,
    unitsUsed: cost.units,
    unitType: cost.unitType,
    costMicroUsd: cost.costMicroUsd,
    costAccuracy: cost.accuracy,
    rawUsage: result?.cost?.rawUsage ?? null,
    latencyMs: Math.max(0, Date.now() - started),
  });

  // Always report the completed attempt so its cost reconciles with the ledger,
  // even when there is no usable cover to swap in.
  const coverUrl = usable && cleanImage ? cleanImage : null;
  await deps.onComplete(coverUrl, cost.costMicroUsd);
  return { coverUrl };
}
