import { describe, expect, it, vi } from "vitest";
import { createApifyResolver } from "./apify";
import type { ImportRequest } from "../schema";
import type { InstagramMedia } from "../apify";

const req: ImportRequest = {
  sourceKind: "instagram_post",
  url: "https://www.instagram.com/p/abc/",
  text: null,
  userId: "u1",
  importId: "imp1",
};

describe("createApifyResolver", () => {
  it("maps a caption-led result to complete evidence with a per-result cost", async () => {
    const media: InstagramMedia = {
      caption: "One-pan orzo. 500g chicken, 250g orzo. Method: brown, simmer 12 min.",
      videoUrl: null,
      imageUrl: "https://cdn.test/i.jpg",
      handle: "krissy",
      costCents: 0.27,
    };
    const resolver = createApifyResolver({ fetchInstagram: vi.fn().mockResolvedValue(media) });
    const r = await resolver.resolve(req, { previousEvidence: [] });

    expect(r.evidence.retrievalStatus).toBe("complete");
    expect(r.evidence.caption).toContain("orzo");
    expect(r.evidence.creatorName).toBe("krissy");
    expect(r.evidence.postType).toBe("single_image");
    expect(r.cost).toEqual({
      providerId: "apify",
      serviceId: "instagram_scraper",
      unitsUsed: 1,
      unitType: "result",
      rawUsage: { costCents: 0.27 },
    });
    expect(r.failure).toBeNull();
  });

  it("flags a teaser Reel (recipe in the video) as video_unavailable", async () => {
    const media: InstagramMedia = {
      caption: "Full recipe on my channel! Link in bio 🎥",
      videoUrl: "https://cdn.test/v.mp4",
      imageUrl: null,
      handle: "chef",
      costCents: 0.27,
    };
    const resolver = createApifyResolver({ fetchInstagram: vi.fn().mockResolvedValue(media) });
    const r = await resolver.resolve(req, { previousEvidence: [] });
    expect(r.evidence.postType).toBe("reel");
    expect(r.evidence.evidenceWarnings).toContain("video_unavailable");
  });

  it("returns source_retrieval_failed (never a throw) when the scraper gives nothing", async () => {
    const resolver = createApifyResolver({ fetchInstagram: vi.fn().mockResolvedValue(null) });
    const r = await resolver.resolve(req, { previousEvidence: [] });
    expect(r.failure).toBe("source_retrieval_failed");
    expect(r.cost).toBeNull();
  });

  it("discards unrelated profile data — only recipe-bearing fields survive", async () => {
    const media = {
      caption: "500g chicken, 250g orzo. Simmer 12 min.",
      videoUrl: null,
      imageUrl: "https://cdn.test/i.jpg",
      handle: "krissy",
      costCents: 0.27,
      // fields the scraper may include but we must never retain:
      followersCount: 99999,
      likesCount: 1234,
      comments: ["yum"],
    } as unknown as InstagramMedia;
    const resolver = createApifyResolver({ fetchInstagram: vi.fn().mockResolvedValue(media) });
    const r = await resolver.resolve(req, { previousEvidence: [] });
    const serialised = JSON.stringify(r.evidence);
    expect(serialised).not.toContain("followersCount");
    expect(serialised).not.toContain("likesCount");
    expect(serialised).not.toContain("yum");
  });
});
