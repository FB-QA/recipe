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
    // Scope the mark to the OBSERVING build. "A newer build exists" is only true from
    // the perspective of the build that saw it; once the client reloads onto that newer
    // build, APP_VERSION changes and the mark self-expires (see updateSeen). Without
    // this the flag is a bare, sticky "1" that survives the reload — poisoning EVERY
    // later error in the tab into "That didn't go to plan" until the tab is closed.
    sessionStorage.setItem(UPDATE_SEEN_KEY, APP_VERSION);
  } catch {
    // ignore — the header sniff will simply set it again on the next response.
  }
}
export function updateSeen(): boolean {
  try {
    // Only honour a mark set by the build we are CURRENTLY running. A mark left by an
    // older build (still in sessionStorage after a reload landed us here) is stale by
    // definition and must not classify this build's errors as deploy-skew.
    return sessionStorage.getItem(UPDATE_SEEN_KEY) === APP_VERSION;
  } catch {
    return false;
  }
}
/** Clear the "update seen" mark. Called once a response confirms the client is back in
 *  sync (live version === this build), i.e. the reload has landed on the new build.
 *  Without this the flag would outlive the mismatch it represents and misclassify every
 *  later unrelated error in the tab as deploy-skew. */
export function clearUpdateSeen(): void {
  try {
    sessionStorage.removeItem(UPDATE_SEEN_KEY);
  } catch {
    // nothing persisted to clear.
  }
}

const RELOAD_STAMP_KEY = "cookdex:recovery-reload-at";
/** The shortest gap between two recovery reloads. A genuine (non-deploy) error that
 *  keeps throwing must never spin the page in a reload loop, so we reload at most once
 *  per window and otherwise let the real error surface. */
export const RELOAD_WINDOW_MS = 20_000;

/** Guard with a side effect: may we reload now? Records the attempt so the next call
 *  within the window is refused. Separated from the reload itself so it is unit-testable.
 *
 *  When storage is unavailable we return FALSE, not true: a reload wipes in-memory state,
 *  so without a persisted stamp we cannot tell a fresh recovery from a loop. Refusing the
 *  automatic reload degrades to the visible error boundary (which the user can reload past)
 *  rather than trapping them in an invisible reload loop. */
export function mayRecoveryReload(now: number = Date.now()): boolean {
  if (!canRecoveryReload(now)) return false;
  try {
    sessionStorage.setItem(RELOAD_STAMP_KEY, String(now));
    return true;
  } catch {
    // Couldn't record the attempt — see the doc comment: refuse rather than risk a loop.
    return false;
  }
}

/** Pure read: is a recovery reload permitted right now? True only when we can both prove
 *  no reload happened within the window AND persist the next one. Storage blocked → false,
 *  so callers never show a recovery spinner for a reload that will not fire. Safe to
 *  consult during render. */
export function canRecoveryReload(now: number = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_STAMP_KEY) ?? 0);
    return !(Number.isFinite(last) && now - last < RELOAD_WINDOW_MS);
  } catch {
    return false;
  }
}

/** Hard-reload onto the current build, guarded against loops. Returns whether it
 *  actually reloaded (false = suppressed because we reloaded moments ago). Use for
 *  AUTOMATIC recovery, where an unguarded reload could loop. */
export function guardedReload(): boolean {
  if (!mayRecoveryReload()) return false;
  window.location.reload();
  return true;
}

/** Hard-reload with no guard — for an EXPLICIT user action (the "Refresh" control). A
 *  deliberate press is not a loop risk, and must always work even when storage is
 *  unavailable and {@link guardedReload} would refuse. */
export function forceReload(): void {
  window.location.reload();
}
