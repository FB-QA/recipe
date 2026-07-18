import { createHash } from "node:crypto";
import { BROWSER_USER_AGENT } from "@/lib/http";
import { safeFetchDetailed, readCapped } from "@/lib/safe-fetch";
import { extractRecipeFromHtml, jsonLdImageUrl } from "../jsonld";
import { minimumUsable } from "../validate";
import type {
  ImportRequest,
  ResolverContext,
  SourceResolver,
  SourceResolverResult,
} from "../schema";

/**
 * §11 — the website flow. Secure server-side fetch, then:
 *   1. schema.org/Recipe JSON-LD → a deterministic, zero-cost recipe (AC1).
 *      When it clears the "minimum usable" bar the resolver returns it as
 *      `deterministicRecipe` and the engine spends no AI attempt.
 *   2. otherwise isolate the readable page text and hand it to the AI rung —
 *      never the raw HTML (§11).
 * The Instagram resolvers own instagram.com; this resolver supports every
 * other http(s) URL.
 */

const MAX_AI_TEXT = 12_000;

/** Strip scripts/styles/tags to readable text; collapse whitespace. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The recipe's cover image: JSON-LD image first, then og:image. */
export function websiteImageUrl(html: string): string | null {
  const jsonld = jsonLdImageUrl(html);
  if (jsonld) return jsonld;
  const og =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  return og?.[1] ?? null;
}

/** Site name from the URL host: "www.bbcgoodfood.com" → "bbcgoodfood". */
export function siteNameFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const parts = host.split(".");
    // Drop the public suffix — one label (.com) or two (.co.uk).
    const twoLevelTld = parts.length >= 3 && ["co", "com", "org", "net", "gov", "ac"].includes(parts[parts.length - 2]);
    const idx = twoLevelTld ? parts.length - 3 : parts.length - 2;
    return parts[idx] || host || null;
  } catch {
    return null;
  }
}

/** Map a defensive-fetch outcome to a failure reason (pure, unit-tested). */
export function websiteFailureFor(kind: "timeout" | "too_large" | "unsafe" | "network"): SourceResolverResult["failure"] {
  return kind === "timeout"
    ? "source_timeout"
    : kind === "too_large"
      ? "source_too_large"
      : kind === "unsafe"
        ? "unsupported_source"
        : "source_retrieval_failed";
}

export interface WebsiteInterpretation {
  deterministicRecipe: ReturnType<typeof extractRecipeFromHtml>;
  caption: string | null;
  title: string | null;
  imageUrl: string | null;
  retrievalStatus: "complete" | "partial" | "unavailable";
  warnings: SourceResolverResult["evidence"]["evidenceWarnings"];
  failure: SourceResolverResult["failure"];
  fingerprint: string;
}

/**
 * The website decision, isolated from the network so it is unit-testable
 * without DNS: JSON-LD first (AC1), else readable page text for the AI rung.
 */
export function interpretWebsiteHtml(html: string): WebsiteInterpretation {
  const imageUrl = websiteImageUrl(html);
  const jsonld = extractRecipeFromHtml(html);
  if (jsonld && minimumUsable(jsonld)) {
    return {
      deterministicRecipe: jsonld,
      caption: null, // AI skipped; no text to carry
      title: jsonld.title,
      imageUrl,
      retrievalStatus: "complete",
      warnings: [],
      failure: null,
      fingerprint: createHash("sha256").update(html).digest("hex").slice(0, 32),
    };
  }
  const text = htmlToText(html).slice(0, MAX_AI_TEXT);
  return {
    deterministicRecipe: null,
    caption: text.length > 0 ? text : null,
    title: null,
    imageUrl,
    retrievalStatus: text.length > 0 ? "partial" : "unavailable",
    warnings: text.length > 0 ? ["unknown_completeness"] : [],
    failure: text.length > 0 ? null : "source_retrieval_failed",
    fingerprint: text.length > 0 ? createHash("sha256").update(text).digest("hex").slice(0, 32) : "",
  };
}

export const websiteResolver: SourceResolver = {
  resolverId: "website_direct",
  providerId: null,
  serviceId: null,

  supports(request: ImportRequest): boolean {
    return request.sourceKind === "website" && request.url !== null;
  },

  async resolve(request: ImportRequest, context: ResolverContext): Promise<SourceResolverResult> {
    const fetched = await safeFetchDetailed(request.url!, {
      headers: { "user-agent": BROWSER_USER_AGENT, accept: "text/html,application/xhtml+xml" },
      fetchImpl: context.fetchImpl,
    });

    const unavailable = (failure: SourceResolverResult["failure"], responseStatus: number | null = null): SourceResolverResult => ({
      evidence: {
        sourceType: "website",
        sourceUrl: request.url,
        retrievalStatus: failure === "unsupported_source" ? "unsupported" : "unavailable",
        resolverId: "website_direct",
        resolverAttemptId: "",
        caption: null,
        title: null,
        creatorName: null,
        media: [],
        evidenceWarnings: [],
        contentFingerprint: null,
        retrievedAt: new Date().toISOString(),
      },
      cost: null,
      failure,
      responseStatus,
    });

    if (fetched.kind !== "ok") return unavailable(websiteFailureFor(fetched.kind));

    const res = fetched.response;
    const buf = await readCapped(res);
    if (buf === null) return unavailable("source_too_large", res.status);
    if (!res.ok) return unavailable("source_retrieval_failed", res.status);

    const html = buf.toString("utf8");
    const seen = interpretWebsiteHtml(html);
    return {
      evidence: {
        sourceType: "website",
        sourceUrl: request.url,
        retrievalStatus: seen.retrievalStatus,
        resolverId: "website_direct",
        resolverAttemptId: "",
        caption: seen.caption,
        title: seen.title,
        creatorName: siteNameFromUrl(request.url!),
        media: seen.imageUrl
          ? [{ id: "web-image-0", position: 0, modality: "image", mimeType: null, sourceUrl: seen.imageUrl, storagePath: null, width: null, height: null, durationSeconds: null }]
          : [],
        evidenceWarnings: seen.warnings,
        contentFingerprint: seen.fingerprint || null,
        retrievedAt: new Date().toISOString(),
      },
      deterministicRecipe: seen.deterministicRecipe,
      cost: null,
      failure: seen.failure,
      responseStatus: res.status,
      contentType: res.headers.get("content-type"),
      contentBytes: buf.length,
    };
  },
};
