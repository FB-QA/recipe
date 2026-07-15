export const DAILY_IMPORT_LIMIT = 25;

/**
 * The one gate on the daily import cap. Exempt users (a row in
 * `import_limit_exemptions`, granted by the operator — there is no UI)
 * are never blocked; everyone else stops at the cap.
 */
export function importCapReached(recentCount: number | null, exempt: boolean): boolean {
  return !exempt && (recentCount ?? 0) >= DAILY_IMPORT_LIMIT;
}
