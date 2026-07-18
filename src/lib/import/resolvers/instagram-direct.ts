import { createHash } from "node:crypto";
import { BROWSER_USER_AGENT } from "@/lib/http";
import { safeFetchDetailed, readCapped } from "@/lib/safe-fetch";
import type {
  ImportRequest,
  PostType,
  RecipeImportSourceType,
  ResolverContext,
  SourceEvidence,
  SourceEvidenceWarning,
  SourceMedia,
  SourceResolver,
  SourceResolverResult,
} from "../schema";

/**
 * §9.1 — direct public-page retrieval, the free first rung of the Instagram
 * chain. Small independent parser modules (Open Graph, embedded JSON, page
 * markers) — never one fragile selector; each fails alone and the worst
 * outcome is a `source_format_changed` warning, never a crash.
 *
 * Login wall in disguise (probed live 2026-07-17, §27 fixture 9): Instagram
 * returns HTTP 200 with ~600KB of login-shell HTML for anonymous fetches.
 * Success is judged by evidence content — never by status code or byte count.
 */

const IG_HOSTS = /(^|\.)instagram\.com$/i;

export function classifyInstagramUrl(raw: string): RecipeImportSourceType | null {
  try {
    const url = new URL(raw);
    if (!IG_HOSTS.test(url.hostname)) return null;
    const path = url.pathname;
    if (/^\/(?:reel|reels|tv)\//.test(path)) return "instagram_reel";
    if (/^\/p\//.test(path)) return "instagram_post";
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------
// Parser modules — each independent, each best-effort.
// ---------------------------------------------------------------

function metaContent(html: string, property: string): string | null {
  const esc = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m =
    html.match(new RegExp(`<meta[^>]+property=["']${esc}["'][^>]+content=["']([^"']*)["']`, "i")) ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${esc}["']`, "i"));
  const value = m?.[1]?.trim() ?? "";
  return value ? decodeEntities(value) : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** OG module: title / description / image / video. */
function parseOpenGraph(html: string) {
  return {
    title: metaContent(html, "og:title"),
    description: metaContent(html, "og:description"),
    image: metaContent(html, "og:image"),
    video: metaContent(html, "og:video"),
  };
}

/** The quoted caption inside IG's og:title / og:description formats. */
function quotedCaption(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/[:\-]\s*[“"]([\s\S]+)[”"]\s*$/);
  return m ? m[1].trim() : null;
}

/** Display name from `<name> on Instagram: "…"` (a fallback — not the handle). */
function ogCreator(title: string | null): string | null {
  const m = title?.match(/^(.*?)\s+on Instagram\b/i);
  return m ? m[1].trim() || null : null;
}

/**
 * The real @username lives in og:description, not og:title:
 *   "19K likes, 185 comments - emthenutritionist on March 16, 2026: …"
 * og:title only carries the display name ("Emily English on Instagram"). Prefer
 * this so the attribution shows the actual handle, no login and no Apify needed.
 */
function ogUsernameFromDescription(description: string | null): string | null {
  const m = description?.match(/[-–—]\s*([a-z0-9._]{1,30})\s+on\s+[A-Z]/);
  return m ? m[1] : null;
}

/** Embedded-JSON module: caption text from script-data patterns. */
function embeddedCaption(html: string): string | null {
  // edge_media_to_caption {"edges":[{"node":{"text":"..."}}]}
  const edge = html.match(/"edge_media_to_caption"\s*:\s*\{\s*"edges"\s*:\s*\[\s*\{\s*"node"\s*:\s*\{\s*"text"\s*:\s*("(?:[^"\\]|\\.)*")/);
  if (edge) {
    try {
      return JSON.parse(edge[1]) as string;
    } catch {
      /* independent module — fall through */
    }
  }
  const plain = html.match(/"caption"\s*:\s*("(?:[^"\\]|\\.)*")/);
  if (plain) {
    try {
      const text = JSON.parse(plain[1]) as string;
      return text.trim() || null;
    } catch {
      /* fall through */
    }
  }
  return null;
}

const LOGIN_MARKERS = /"loginPage"|loginForm|Log in to Instagram|\/accounts\/login/i;
const TRUNCATION = /(?:…|\.\.\.)\s*(?:more)?\s*$/i;

/**
 * The login shell: login markers present AND no OG recipe-bearing data AND
 * no embedded caption. Never judged by status code or byte count.
 */
export function detectLoginShell(html: string): boolean {
  if (!LOGIN_MARKERS.test(html)) return false;
  const og = parseOpenGraph(html);
  const hasOg = Boolean(og.title || og.description || og.image || og.video);
  return !hasOg && embeddedCaption(html) === null;
}

export interface ParsedInstagramPage {
  caption: string | null;
  title: string | null;
  creatorName: string | null;
  postType: PostType;
  media: SourceMedia[];
  warnings: SourceEvidenceWarning[];
}

export function parseInstagramHtml(html: string): ParsedInstagramPage {
  const warnings: SourceEvidenceWarning[] = [];

  if (detectLoginShell(html)) {
    return { caption: null, title: null, creatorName: null, postType: "unknown", media: [], warnings: ["login_wall_detected"] };
  }
  if (/"is_private"\s*:\s*true/.test(html) || /This Account is Private/i.test(html)) {
    warnings.push("private_content");
  }
  if (/Page Not Found/i.test(html) || /Sorry, this page isn'?t available/i.test(html)) {
    warnings.push("deleted_content");
  }

  const og = parseOpenGraph(html);
  const caption = embeddedCaption(html) ?? quotedCaption(og.description) ?? quotedCaption(og.title);
  // Prefer the real @username (og:description / embedded JSON) over the display
  // name (og:title). The handle is what the attribution needs.
  const creatorName = ogUsernameFromDescription(og.description) ?? ogUsernameFromJson(html) ?? ogCreator(og.title);

  let postType: PostType = "unknown";
  if (og.video || /"is_video"\s*:\s*true/.test(html)) postType = "reel";
  else if (/"edge_sidecar_to_children"/.test(html) || /"carousel_media"/.test(html)) postType = "carousel";
  else if (og.image) postType = "single_image";

  const media: SourceMedia[] = [];
  if (og.image) {
    media.push({
      id: "og-image-0",
      position: 0,
      modality: "image",
      mimeType: null,
      sourceUrl: og.image,
      storagePath: null,
      width: null,
      height: null,
      durationSeconds: null,
    });
  }
  if (og.video) {
    media.push({
      id: "og-video-0",
      position: media.length,
      modality: "video",
      mimeType: null,
      sourceUrl: og.video,
      storagePath: null,
      width: null,
      height: null,
      durationSeconds: null,
    });
  }

  if (!caption) warnings.push("caption_missing");
  else if (TRUNCATION.test(caption)) warnings.push("caption_may_be_truncated");

  // Carousels: an anonymous page never exposes every slide — the caption
  // carries the recipe or the evidence is partial (§9.1, edge case).
  if (postType === "carousel") warnings.push("carousel_items_missing");
  // Reels: the server-side HTML rarely yields a usable video file, and video
  // extraction is unsupported this story (§0.2).
  if (postType === "reel") warnings.push("video_unavailable");

  // Structure unrecognised / changed: no caption came back and none of the
  // decisive content warnings explain why. Every parser module ran and none
  // yielded recipe text — flag drift and let the chain continue (§9.1 edge case).
  const decisive =
    warnings.includes("login_wall_detected") ||
    warnings.includes("private_content") ||
    warnings.includes("deleted_content");
  if (!caption && !decisive && !warnings.includes("source_format_changed")) {
    warnings.push("source_format_changed");
  }

  return { caption, title: og.title, creatorName, postType, media, warnings };
}

function ogUsernameFromJson(html: string): string | null {
  const m = html.match(/"owner"\s*:\s*\{[^}]*"username"\s*:\s*"([^"\\]+)"/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------

function fingerprint(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

export const instagramDirectResolver: SourceResolver = {
  resolverId: "instagram_direct",
  providerId: null, // direct fetch — zero third-party cost, still tracked (§23)
  serviceId: null,

  supports(request: ImportRequest): boolean {
    return request.url !== null && classifyInstagramUrl(request.url) !== null;
  },

  async resolve(request: ImportRequest, context: ResolverContext): Promise<SourceResolverResult> {
    const sourceType = classifyInstagramUrl(request.url ?? "") ?? "instagram_post";
    const base = (over: Partial<SourceEvidence>): SourceEvidence => ({
      sourceType,
      sourceUrl: request.url,
      retrievalStatus: "unavailable",
      resolverId: "instagram_direct",
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

    const fetched = await safeFetchDetailed(request.url!, {
      headers: { "user-agent": BROWSER_USER_AGENT, accept: "text/html,application/xhtml+xml" },
      // Redirects to another Instagram URL are re-validated; anything leaving
      // instagram.com is rejected (story edge case). Private-net rejection is
      // safeFetch's own SSRF guard on every hop.
      hostAllowed: (url) => IG_HOSTS.test(url.hostname),
      fetchImpl: context.fetchImpl,
    });

    if (fetched.kind !== "ok") {
      const failure =
        fetched.kind === "timeout"
          ? ("source_timeout" as const)
          : fetched.kind === "too_large"
            ? ("source_too_large" as const)
            : ("source_retrieval_failed" as const);
      return {
        evidence: base({}),
        cost: null,
        failure,
        responseStatus: null,
        contentBytes: null,
      };
    }

    const res = fetched.response;
    const buf = await readCapped(res);
    if (buf === null) {
      return { evidence: base({}), cost: null, failure: "source_too_large", responseStatus: res.status };
    }
    const html = buf.toString("utf8");

    if (!res.ok) {
      const failure =
        res.status === 404 ? ("deleted_content" as const) : ("source_retrieval_failed" as const);
      return {
        evidence: base({ evidenceWarnings: res.status === 404 ? ["deleted_content"] : [] }),
        cost: null,
        failure,
        responseStatus: res.status,
        contentType: res.headers.get("content-type"),
        contentBytes: buf.length,
      };
    }

    const parsed = parseInstagramHtml(html);
    const decisive =
      parsed.warnings.includes("login_wall_detected") ||
      parsed.warnings.includes("private_content") ||
      parsed.warnings.includes("deleted_content");

    const retrievalStatus = decisive
      ? "unavailable"
      : parsed.caption
        ? parsed.warnings.includes("caption_may_be_truncated") || parsed.postType === "carousel"
          ? "partial"
          : "complete"
        : "partial";

    return {
      evidence: base({
        retrievalStatus,
        postType: parsed.postType,
        caption: parsed.caption,
        title: parsed.title,
        creatorName: parsed.creatorName,
        media: parsed.media,
        evidenceWarnings: parsed.warnings,
        contentFingerprint: parsed.caption ? fingerprint(parsed.caption) : null,
      }),
      cost: null,
      responseStatus: res.status,
      contentType: res.headers.get("content-type"),
      contentBytes: buf.length,
      failure: parsed.warnings.includes("login_wall_detected")
        ? "login_wall_detected"
        : parsed.warnings.includes("private_content")
          ? "private_content"
          : parsed.warnings.includes("deleted_content")
            ? "deleted_content"
            : null,
    };
  },
};
