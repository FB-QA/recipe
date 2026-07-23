/**
 * Version lifecycle — the primitives.
 *
 * A long-lived client (a PWA reopened after days, a tab left open) holds the build it
 * first loaded. When a new version deploys, that client's build-coupled requests —
 * Next's RSC payloads and Server Actions carry build-specific ids — no longer match
 * the live deployment, and it throws ("That didn't go to plan").
 *
 * The fix, the way it's done at scale: the server advertises the LIVE version on a
 * header it stamps on responses the client already makes (see the middleware), the
 * client reads it off that existing traffic — NO polling, NO extra endpoint, NO
 * serverless cost — and reloads onto the new build at a safe seam. See
 * {@link ./version-manager}. This module is the framework-agnostic core; drop the
 * folder into any Next app.
 */

/** This build's version — a git SHA, injected at build time (see next.config.ts).
 *  Baked into the client bundle AND read by the server at runtime, so a client that
 *  loaded an old deploy can tell it is now talking to a newer one. "dev" when unset. */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

/** The header the middleware stamps on every response to advertise the live deploy's
 *  version. */
export const VERSION_HEADER = "x-app-version";

/** A version string worth comparing — absent or the local "dev" sentinel means "don't
 *  bother", so version logic is inert in development and never false-triggers. */
export const hasRealVersion = APP_VERSION !== "dev" && APP_VERSION.length > 0;

/**
 * True for the errors a stale client throws after a deploy — a code-split chunk or a
 * dynamically-imported module the new deployment no longer serves. These recover with
 * a single hard reload onto the new build; genuine application errors do not, so they
 * must be told apart.
 */
export function isDeployError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "");
  return /ChunkLoadError|Loading chunk [\w./-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Failed to find Server Action|older or newer deployment|__next_version_mismatch__/i.test(
    text,
  );
}

const UPDATE_SEEN_KEY = "cookdex:update-seen";
/** Record that we have observed a NEWER deploy than the one this client is running.
 *  Once set, any subsequent error is treated as deploy-skew and recovered — a
 *  message-independent signal, so it catches Server-Action mismatches whose wording
 *  we would otherwise have to chase across framework versions. */
export function markUpdateSeen(): void {
  try {
    sessionStorage.setItem(UPDATE_SEEN_KEY, "1");
  } catch {
    // ignore — the header sniff will simply set it again on the next response.
  }
}
export function updateSeen(): boolean {
  try {
    return sessionStorage.getItem(UPDATE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

const RELOAD_STAMP_KEY = "cookdex:recovery-reload-at";
/** The shortest gap between two recovery reloads. A genuine (non-deploy) error that
 *  keeps throwing must never spin the page in a reload loop, so we reload at most once
 *  per window and otherwise let the real error surface. */
export const RELOAD_WINDOW_MS = 20_000;

/** Pure guard: may we reload now? Records the attempt so the next call within the
 *  window is refused. Separated from the reload itself so it is unit-testable. */
export function mayRecoveryReload(now: number = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_STAMP_KEY) ?? 0);
    if (Number.isFinite(last) && now - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_STAMP_KEY, String(now));
    return true;
  } catch {
    // sessionStorage blocked (rare privacy modes) — allow the reload rather than trap.
    return true;
  }
}

/** Read-only counterpart to {@link mayRecoveryReload}: did a recovery reload happen
 *  within the window? Pure (no write), so it's safe to consult during render to decide
 *  whether to show a recovery spinner or the real error. */
export function recentlyReloaded(now: number = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_STAMP_KEY) ?? 0);
    return Number.isFinite(last) && last > 0 && now - last < RELOAD_WINDOW_MS;
  } catch {
    return false;
  }
}

/** Hard-reload onto the current build, guarded against loops. Returns whether it
 *  actually reloaded (false = suppressed because we reloaded moments ago). */
export function guardedReload(): boolean {
  if (!mayRecoveryReload()) return false;
  window.location.reload();
  return true;
}
