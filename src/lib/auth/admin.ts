import type { VerifiedUser } from "./session";

/**
 * Admin identity for this sole-operator app (spec §24 — Freddi-only routes).
 * No role column: admin is the single email in ADMIN_EMAIL. A missing/blank
 * env means "no admin" (deny), never "everyone". The ledger tables also grant
 * nothing to `authenticated`, so non-admins can't read the data via the API
 * either — this gate is defence in depth, not the only lock (AC4).
 */
export function isAdmin(user: VerifiedUser | null): boolean {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail || !user?.email) return false;
  return user.email.trim().toLowerCase() === adminEmail;
}
