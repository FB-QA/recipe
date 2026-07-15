import type { Client } from "@/lib/supabase/server";

/**
 * The daily import cap, in one place: the size of the allowance, the rolling
 * window it applies over, and the gate that decides whether a given user is
 * blocked. Exempt users (a row in `import_limit_exemptions`, granted by the
 * operator — there is no UI and no client write path) are never blocked.
 */

export const DAILY_IMPORT_LIMIT = 25;
export const IMPORT_WINDOW_MS = 24 * 3600 * 1000;

/** Start of the rolling import-limit window, as an ISO timestamp. */
export function windowCutoff(now: number = Date.now()): string {
  return new Date(now - IMPORT_WINDOW_MS).toISOString();
}

/** The pure decision: at or past the cap, and not exempt. */
export function importCapReached(recentCount: number | null, exempt: boolean): boolean {
  return !exempt && (recentCount ?? 0) >= DAILY_IMPORT_LIMIT;
}

/**
 * True when this user has crossed the daily cap and holds no exemption.
 * The exemption lookup only fires once the cap is actually reached, so the
 * common case costs a single RPC — same as before exemptions existed.
 */
export async function importBlocked(supabase: Client, userId: string): Promise<boolean> {
  const { data: recent } = await supabase.rpc("imports_since", { cutoff: windowCutoff() });
  if (!importCapReached(recent, false)) return false;

  const { data: exemption } = await supabase
    .from("import_limit_exemptions")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return importCapReached(recent, exemption !== null);
}
