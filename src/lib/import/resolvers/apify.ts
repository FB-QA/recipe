import { createHash } from "node:crypto";
import { fetchInstagram, type InstagramMedia } from "../apify";
import { importConfig } from "../config";
import { classifyInstagramUrl } from "./instagram-direct";
import { hasRecipeSignal } from "../evidence";
import type {
  ImportRequest,
  PostType,
  ResolverContext,
  SourceEvidence,
  SourceEvidenceWarning,
  SourceMedia,
  SourceResolver,
  SourceResolverResult,
} from "../schema";

/**
 * §9.3 — Apify, the automatic reliability fallback. Reached only when the
 * cheaper rungs failed or produced incomplete evidence (the engine enforces
 * ordering; this resolver just runs when asked). The paid scraper is isolated
 * in `../apify.ts` (circuit-breakered, aborts a run it won't read); here we map
 * its result into `SourceEvidence` and nothing outside this adapter touches raw
 * Apify data. Only recipe-bearing fields are retained (§9.3) — comments,
 * follower counts and analytics are never requested or kept.
 *
 * Priced per result (2.7M nano-USD ≈ $2.70/1000, §23): units_used = 1 result.
 */

type FetchInstagramFn = (url: string) => Promise<InstagramMedia | null>;

export function createApifyResolver(options?: { fetchInstagram?: FetchInstagramFn }): SourceResolver {
  const scrape = options?.fetchInstagram ?? fetchInstagram;

  return {
    resolverId: "apify_instagram",
    providerId: "apify",
    serviceId: "instagram_scraper",

    supports(request: ImportRequest): boolean {
      return (
        Boolean(importConfig().apifyToken) &&
        request.url !== null &&
        classifyInstagramUrl(request.url) !== null
      );
    },

    async resolve(request: ImportRequest, _context: ResolverContext): Promise<SourceResolverResult> {
      const sourceType = classifyInstagramUrl(request.url ?? "") ?? "instagram_post";
      const evidence = (over: Partial<SourceEvidence>): SourceEvidence => ({
        sourceType,
        sourceUrl: request.url,
        retrievalStatus: "unavailable",
        resolverId: "apify_instagram",
        resolverAttemptId: "",
        postType: "unknown",
        caption: null,
        title: null,
        creatorName: null,
        media: [],
        evidenceWarnings: [],
        contentFingerprint: null,
        retrievedAt: new Date().toISOString(),
        ...over,
      });

      const media = await scrape(request.url!);
      if (!media) {
        // Circuit-breaker returned null — a failure, not incomplete evidence.
        // No endless retries here; the engine offers the user fallback (§9.3).
        return { evidence: evidence({}), cost: null, failure: "source_retrieval_failed" };
      }

      const caption = media.caption?.trim() || null;
      const postType: PostType = media.videoUrl ? "reel" : media.imageUrl ? "single_image" : "unknown";
      const warnings: SourceEvidenceWarning[] = [];
      if (!caption) warnings.push("caption_missing");
      // A Reel whose recipe is in the video, not the caption: video extraction
      // is unsupported this story (§0.2), so flag it and let the gate fall to
      // user input rather than pretend.
      if (postType === "reel" && !hasRecipeSignal(caption ?? "")) warnings.push("video_unavailable");

      const mediaItems: SourceMedia[] = [];
      if (media.imageUrl) {
        mediaItems.push({
          id: "apify-image-0", position: 0, modality: "image",
          mimeType: null, sourceUrl: media.imageUrl, storagePath: null,
          width: null, height: null, durationSeconds: null,
        });
      }
      if (media.videoUrl) {
        mediaItems.push({
          id: "apify-video-0", position: mediaItems.length, modality: "video",
          mimeType: null, sourceUrl: media.videoUrl, storagePath: null,
          width: null, height: null, durationSeconds: null,
        });
      }

      return {
        evidence: evidence({
          retrievalStatus: caption ? "complete" : "partial",
          postType,
          caption,
          creatorName: media.handle,
          media: mediaItems,
          evidenceWarnings: warnings,
          contentFingerprint: caption ? createHash("sha256").update(caption).digest("hex").slice(0, 32) : null,
        }),
        cost: {
          providerId: "apify",
          serviceId: "instagram_scraper",
          unitsUsed: 1,
          unitType: "result",
          rawUsage: { costCents: media.costCents },
        },
        externalRunId: null,
        failure: null,
      };
    },
  };
}
