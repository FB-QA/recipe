import type { ImportAiConfig } from "./config";
import { createAnthropicProvider } from "./providers/anthropic";
import { createGeminiProvider } from "./providers/gemini";
import { instagramDirectResolver } from "./resolvers/instagram-direct";
import { createGeminiUrlContextResolver } from "./resolvers/gemini-url-context";
import { createApifyResolver } from "./resolvers/apify";
import { websiteResolver } from "./resolvers/website";
import { pastedTextResolver } from "./resolvers/pasted-text";
import type { ImportRequest, RecipeExtractionProvider, SourceResolver } from "./schema";

/**
 * The registry (§15, api.md). Keyed by resolverId/providerId. The Gemini pair
 * is registered ONLY when GOOGLE_API_KEY is present (§0.1); when it is absent
 * the URL-context rung is reported as a **gated-out** rung the engine records
 * as `unavailable` (W3) — never silently absent (AC9). Switching provider or
 * model is configuration-only.
 */

export interface GatedRung {
  resolverId: string;
  providerId: string | null;
  serviceId: string | null;
  reason: "no_google_api_key" | "no_apify_token";
}

export interface ResolverChain {
  /** Ordered rungs to actually run. */
  chain: SourceResolver[];
  /** Rungs that exist in the design but are switched off by configuration. */
  gatedOut: GatedRung[];
}

/**
 * Order per spec §2: direct → URL context (config-gated) → Apify → user input.
 * The user-input fallback is not a resolver; the engine renders it when the
 * chain is exhausted.
 */
export function buildResolverChain(request: ImportRequest, config: ImportAiConfig): ResolverChain {
  if (request.sourceKind === "pasted_text") {
    return { chain: [pastedTextResolver], gatedOut: [] };
  }
  if (request.sourceKind === "website") {
    return { chain: [websiteResolver], gatedOut: [] };
  }

  const isInstagram =
    request.sourceKind === "instagram_post" ||
    request.sourceKind === "instagram_carousel" ||
    request.sourceKind === "instagram_reel";

  if (isInstagram) {
    const chain: SourceResolver[] = [instagramDirectResolver];
    const gatedOut: GatedRung[] = [];

    if (config.googleApiKey) {
      chain.push(createGeminiUrlContextResolver({ apiKey: config.googleApiKey }));
    } else {
      gatedOut.push({
        resolverId: "gemini_url_context",
        providerId: "google",
        serviceId: "url_context",
        reason: "no_google_api_key",
      });
    }

    if (config.apifyToken) {
      chain.push(createApifyResolver());
    } else {
      gatedOut.push({
        resolverId: "apify_instagram",
        providerId: "apify",
        serviceId: "instagram_scraper",
        reason: "no_apify_token",
      });
    }

    return { chain, gatedOut };
  }

  // uploaded_video / screenshot / uploaded_image: no resolver this story (§0.2).
  return { chain: [], gatedOut: [] };
}

/**
 * The primary extraction provider from configuration. Anthropic is the live
 * default (§0.1); Google is selected only when configured AND keyed, otherwise
 * the Gemini adapter reports itself unavailable via `supports()` and the engine
 * records `ai_provider_error` rather than silently swapping (AC9).
 */
export function selectPrimaryProvider(config: ImportAiConfig): RecipeExtractionProvider {
  if (config.primaryProvider === "google") {
    return createGeminiProvider({ apiKey: config.googleApiKey, model: config.primaryModel });
  }
  return createAnthropicProvider({ apiKey: config.anthropicApiKey, model: config.primaryModel });
}
