import { beforeEach, describe, expect, it, vi } from "vitest";
import { enrichImportCover, type CoverEnrichDeps } from "./enrich-cover";
import type { ImportRow } from "./store";
import type { SourceResolverResult } from "./schema";

// A composite (play-button) Reel cover carries `stp=...cmp1...`; the clean Apify
// displayUrl does not. isCompositeReelCover keys on that.
const COMPOSITE = "https://scontent.cdninstagram.com/v/x.jpg?stp=cmp1_dst-jpg_e35_s640x640_tt6&oh=a";
const CLEAN = "https://scontent.cdninstagram.com/v/x.jpg?stp=dst-jpg_e15_tt6&oh=b";

function rowWith(cover: string | null, over: Partial<ImportRow> = {}): ImportRow {
  return {
    id: "imp1",
    user_id: "u1",
    state: "ready_for_review",
    failure_reason: null,
    source_url: "https://www.instagram.com/p/ABC/",
    source_kind: "instagram_reel",
    // Only the cover path matters for these tests.
    extracted: { source: { coverImageUrl: cover } } as ImportRow["extracted"],
    evidence: null,
    quality_score: 1,
    total_cost_micro_usd: 0,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...over,
  };
}

function resolverReturning(result: SourceResolverResult | null) {
  return {
    resolve: vi.fn(async () => {
      if (!result) throw new Error("apify down");
      return result;
    }),
  };
}

function cleanResult(imageUrl: string | null): SourceResolverResult {
  return {
    evidence: {
      sourceType: "instagram_reel",
      sourceUrl: null,
      retrievalStatus: "complete",
      resolverId: "apify_instagram",
      resolverAttemptId: "",
      postType: "reel",
      caption: null,
      title: null,
      creatorName: null,
      media: imageUrl
        ? [{ id: "i0", position: 0, modality: "image", mimeType: null, sourceUrl: imageUrl, storagePath: null, width: null, height: null, durationSeconds: null }]
        : [],
      evidenceWarnings: [],
      contentFingerprint: null,
      retrievedAt: new Date().toISOString(),
    },
    cost: { providerId: "apify", serviceId: "instagram_scraper", unitsUsed: 1, unitType: "result", rawUsage: { costCents: 0.27 } },
    externalRunId: null,
    failure: null,
  };
}

let store: { openRetrievalAttempt: ReturnType<typeof vi.fn>; closeRetrievalAttempt: ReturnType<typeof vi.fn> };
let updateCover: ReturnType<typeof vi.fn>;

function deps(over: Partial<CoverEnrichDeps>): CoverEnrichDeps {
  return {
    row: rowWith(COMPOSITE),
    prices: [],
    store,
    resolver: resolverReturning(cleanResult(CLEAN)),
    request: { sourceKind: "instagram_reel", url: "https://www.instagram.com/p/ABC/", text: null, userId: "u1", importId: "imp1" },
    attemptNumber: 2,
    updateCover,
    ...over,
  };
}

beforeEach(() => {
  store = {
    openRetrievalAttempt: vi.fn(async () => "attempt1"),
    closeRetrievalAttempt: vi.fn(async () => {}),
  };
  updateCover = vi.fn(async () => {});
});

describe("enrichImportCover — replaces a composite Reel cover with the clean one", () => {
  it("swaps in the clean cover and records a succeeded apify_cover attempt", async () => {
    const out = await enrichImportCover(deps({}));
    expect(out).toEqual({ coverUrl: CLEAN });
    expect(store.openRetrievalAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ resolverId: "apify_cover", providerId: "apify" }),
    );
    expect(store.closeRetrievalAttempt).toHaveBeenCalledWith("attempt1", expect.objectContaining({ status: "succeeded" }));
    expect(updateCover).toHaveBeenCalledWith(CLEAN, expect.any(Number));
  });

  it("does nothing (no Apify call) when the cover is already clean", async () => {
    const out = await enrichImportCover(deps({ row: rowWith(CLEAN) }));
    expect(out).toEqual({ coverUrl: CLEAN });
    expect(store.openRetrievalAttempt).not.toHaveBeenCalled();
    expect(updateCover).not.toHaveBeenCalled();
  });

  it("does nothing when the import is not in review", async () => {
    const out = await enrichImportCover(deps({ row: rowWith(COMPOSITE, { state: "saved" }) }));
    expect(out).toEqual({ coverUrl: COMPOSITE });
    expect(store.openRetrievalAttempt).not.toHaveBeenCalled();
  });

  it("keeps the composite and records a failed attempt when Apify fails", async () => {
    const out = await enrichImportCover(deps({ resolver: resolverReturning(null) }));
    expect(out).toEqual({ coverUrl: null });
    expect(store.closeRetrievalAttempt).toHaveBeenCalledWith("attempt1", expect.objectContaining({ status: "failed" }));
    expect(updateCover).not.toHaveBeenCalled();
  });

  it("keeps the composite when Apify returns another composite image", async () => {
    const out = await enrichImportCover(deps({ resolver: resolverReturning(cleanResult(COMPOSITE)) }));
    expect(out).toEqual({ coverUrl: null });
    expect(updateCover).not.toHaveBeenCalled();
  });
});
