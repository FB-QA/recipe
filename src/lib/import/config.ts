/**
 * §3/§16 — provider configuration. Model identifiers live HERE and inside
 * provider adapters only; no other production code names a model ID.
 * Switching provider or model is a configuration change (AC9).
 */

export interface ImportAiConfig {
  primaryProvider: string;
  primaryModel: string;
  replacementModel: string | null;
  fallbackEnabled: boolean;
  anthropicApiKey: string | undefined;
  googleApiKey: string | undefined;
  apifyToken: string | undefined;
  /** §25 — plan framework prepared but disabled. */
  planEnforcementEnabled: boolean;
  /**
   * Reel covers fetched directly carry Instagram's play-button composite frame
   * (`cmp1`, downscaled). When on (default), a Reel whose direct cover is that
   * composite triggers a targeted Apify call for the clean full-res displayUrl —
   * a costed attempt (~$2.70/1000). Set IMPORT_REEL_COVER_ENRICH=false to disable.
   */
  reelCoverEnrich: boolean;
}

// Per-provider default model, used when AI_PRIMARY_MODEL is unset. Switching
// AI_PRIMARY_PROVIDER=google must not require a second env var: without this,
// the default fell through to the Anthropic model id and the Gemini adapter was
// handed `claude-haiku-4-5`, failing every extraction as a provider error.
const DEFAULT_PRIMARY_MODEL: Record<string, string> = {
  anthropic: "claude-haiku-4-5",
  google: "gemini-3.1-flash-lite",
};

export function importConfig(env: NodeJS.ProcessEnv = process.env): ImportAiConfig {
  const primaryProvider = env.AI_PRIMARY_PROVIDER || "anthropic";
  return {
    primaryProvider,
    primaryModel:
      env.AI_PRIMARY_MODEL || DEFAULT_PRIMARY_MODEL[primaryProvider] || "claude-haiku-4-5",
    replacementModel: env.AI_REPLACEMENT_MODEL || null,
    fallbackEnabled: env.AI_PROVIDER_FALLBACK_ENABLED === "true",
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    googleApiKey: env.GOOGLE_API_KEY,
    apifyToken: env.APIFY_API_TOKEN,
    planEnforcementEnabled: env.IMPORT_PLAN_ENFORCEMENT_ENABLED === "true",
    reelCoverEnrich: env.IMPORT_REEL_COVER_ENRICH !== "false",
  };
}

/**
 * Instagram's Reel cover composite: the `cmp1` transform burns in the play
 * triangle and downscales. Detecting it tells us the direct cover is a poor
 * thumbnail worth replacing with Apify's clean displayUrl.
 */
export function isCompositeReelCover(url: string | null | undefined): boolean {
  return Boolean(url && /[?&]stp=[^&]*cmp1/.test(url));
}
