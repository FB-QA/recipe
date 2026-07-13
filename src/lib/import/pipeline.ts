import { extractRecipeFromHtml } from "./jsonld";
import { extractWithAi, aiToExtracted } from "./ai";
import { fetchInstagram } from "./apify";
import { isSafeImportUrl } from "./url-guard";
import { hasCookableContent, type ImportOutcome } from "./types";
import { BROWSER_USER_AGENT } from "@/lib/http";
import { safeFetch, readCapped } from "@/lib/safe-fetch";

export function isInstagramUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "instagram.com" || host.endsWith(".instagram.com");
  } catch {
    return false;
  }
}

function ogImage(html: string): string | null {
  const m =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  return m ? m[1] : null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchHtml(url: string): Promise<string | null> {
  const res = await safeFetch(url, {
    headers: { "user-agent": BROWSER_USER_AGENT, accept: "text/html,application/xhtml+xml" },
  });
  if (!res || !res.ok) return null;
  const buf = await readCapped(res);
  return buf ? buf.toString("utf8") : null;
}

/** Public entry: turn any supported URL into an ImportOutcome. */
export async function importFromUrl(url: string): Promise<ImportOutcome> {
  // SSRF guard — never let a submitted URL point our server at internal hosts.
  if (!(await isSafeImportUrl(url))) {
    return {
      status: "failed",
      costCents: 0,
      error: "That link can't be imported — it needs to be a public recipe page.",
    };
  }
  return isInstagramUrl(url) ? importInstagram(url) : importWebsite(url);
}

async function importWebsite(url: string): Promise<ImportOutcome> {
  const html = await fetchHtml(url);
  if (!html) {
    return {
      status: "failed",
      costCents: 0,
      error:
        "Couldn't reach that page — some sites block automated access. Try pasting the recipe in manually.",
    };
  }

  // Rung 1 — deterministic, free.
  const jsonld = extractRecipeFromHtml(html);
  if (jsonld && hasCookableContent(jsonld)) {
    return { status: "success", sourceType: "website", method: "jsonld", costCents: 0, recipe: jsonld };
  }

  // Rung 2 — cheap AI over the page text.
  const ai = await extractWithAi(htmlToText(html).slice(0, 12000));
  if (ai) {
    const recipe = aiToExtracted(ai.recipe, jsonld?.imageUrl ?? ogImage(html));
    if (hasCookableContent(recipe)) {
      return { status: "success", sourceType: "website", method: "ai_text", costCents: ai.costCents, recipe };
    }
    return {
      status: "no_recipe",
      sourceType: "website",
      method: "ai_text",
      costCents: ai.costCents,
      mediaUrl: null,
      message: "I couldn't find a full recipe on that page.",
    };
  }

  return {
    status: "failed",
    costCents: 0,
    error: "I couldn't read a recipe from that page. Try pasting it in manually.",
  };
}

async function importInstagram(url: string): Promise<ImportOutcome> {
  const media = await fetchInstagram(url);
  if (!media) {
    return {
      status: "failed",
      costCents: 0,
      error:
        "Couldn't fetch that Reel — Instagram sometimes blocks access. Try again in a moment, or add it manually.",
    };
  }

  const ai = await extractWithAi(media.caption);
  const costCents = media.costCents + (ai?.costCents ?? 0);

  if (ai) {
    const recipe = aiToExtracted(ai.recipe, media.imageUrl, media.handle);
    if (hasCookableContent(recipe)) {
      return {
        status: "success",
        sourceType: "instagram",
        method: "apify+ai",
        costCents,
        recipe,
        mediaUrl: media.videoUrl,
      };
    }
  }

  // Teaser Reel: the recipe lives in the video, not the caption. Graceful fallback.
  return {
    status: "no_recipe",
    sourceType: "instagram",
    method: "apify+ai",
    costCents,
    mediaUrl: media.videoUrl ?? url,
    message:
      "This Reel's recipe looks like it's in the video, not the caption. Here's the video — you can add the details yourself.",
  };
}
