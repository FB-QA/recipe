/**
 * §25 — the plan framework. Prepared, disabled. Every import already passes the
 * policy service (`importBlocked`, `limit.ts`); this adds the plan vocabulary
 * and entitlement shape so enforcement can be switched on later by flipping
 * `IMPORT_PLAN_ENFORCEMENT_ENABLED` — no importer rewrite (AC5).
 */

export const PLANS = ["free", "premium", "admin"] as const;
export type Plan = (typeof PLANS)[number];

export interface PlanEntitlements {
  monthlyImportLimit: number | null;
  dailyImportLimit: number | null;
  instagramImportsEnabled: boolean;
  apifyFallbackEnabled: boolean;
  maxScreenshotsPerImport: number;
  maxVideoDurationSeconds: number | null;
  maxVideoBytes: number | null;
  maxTextCharacters: number;
}

/** Default entitlements per plan. Not enforced until the flag is on. */
export const PLAN_ENTITLEMENTS: Record<Plan, PlanEntitlements> = {
  free: {
    monthlyImportLimit: null,
    dailyImportLimit: 25,
    instagramImportsEnabled: true,
    apifyFallbackEnabled: true,
    maxScreenshotsPerImport: 8,
    maxVideoDurationSeconds: null,
    maxVideoBytes: null,
    maxTextCharacters: 100_000,
  },
  premium: {
    monthlyImportLimit: null,
    dailyImportLimit: 200,
    instagramImportsEnabled: true,
    apifyFallbackEnabled: true,
    maxScreenshotsPerImport: 20,
    maxVideoDurationSeconds: 600,
    maxVideoBytes: 200 * 1024 * 1024,
    maxTextCharacters: 200_000,
  },
  admin: {
    monthlyImportLimit: null,
    dailyImportLimit: null,
    instagramImportsEnabled: true,
    apifyFallbackEnabled: true,
    maxScreenshotsPerImport: 50,
    maxVideoDurationSeconds: null,
    maxVideoBytes: null,
    maxTextCharacters: 1_000_000,
  },
};

export function planEnforcementEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.IMPORT_PLAN_ENFORCEMENT_ENABLED === "true";
}

/**
 * The policy decision hook every import passes through. Today it is a no-op
 * (enforcement disabled), so behaviour is unchanged; flip the flag to make the
 * entitlements bite. Returns null when allowed, or a reason when blocked.
 */
export function planAllows(
  plan: Plan,
  check: keyof PlanEntitlements,
  value: number,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!planEnforcementEnabled(env)) return null;
  const limit = PLAN_ENTITLEMENTS[plan][check];
  if (typeof limit === "number" && value > limit) return `plan_restricted:${check}`;
  if (limit === false) return `plan_restricted:${check}`;
  return null;
}
