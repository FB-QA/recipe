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
}

export function importConfig(env: NodeJS.ProcessEnv = process.env): ImportAiConfig {
  return {
    primaryProvider: env.AI_PRIMARY_PROVIDER || "anthropic",
    primaryModel: env.AI_PRIMARY_MODEL || "claude-haiku-4-5",
    replacementModel: env.AI_REPLACEMENT_MODEL || null,
    fallbackEnabled: env.AI_PROVIDER_FALLBACK_ENABLED === "true",
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    googleApiKey: env.GOOGLE_API_KEY,
    apifyToken: env.APIFY_API_TOKEN,
    planEnforcementEnabled: env.IMPORT_PLAN_ENFORCEMENT_ENABLED === "true",
  };
}
