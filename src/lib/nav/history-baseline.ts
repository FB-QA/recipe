/**
 * "Is there an in-app page behind me right now?" — the signal a Back control needs to
 * decide between `router.back()` (restores the previous page's tree + scroll) and a
 * fallback navigation.
 *
 * Why not `window.history.length`: it is a HIGH-WATER MARK. It grows on push and never
 * shrinks when the user goes back, so once the app has pushed a single entry this
 * session it would answer "yes" forever — even after the user has navigated back to (or
 * before) the app's entry point. That re-trips the exact bug the fallback exists to
 * prevent: from a cold entry, tapping Back (fallback to the shelf) then the browser Back
 * (returns to the page) would leave `length` inflated and send the next Back off-site.
 *
 * So we track POSITION, not length. Each history entry is stamped with a monotonically
 * increasing index in `history.state`; the app's entry point is the baseline index; we
 * are "in-app" only while the current position is deeper than that baseline. Stamping
 * spreads the existing state, so Next's own history keys (and its scroll restoration)
 * are preserved untouched. The trackers are module singletons — they persist across
 * client navigations and reset on a full document load, which is correct.
 */
const KEY = "__cookdexHistIdx";

let baselineIdx: number | null = null;
let currentIdx = 0;
let maxIdx = 0;

function stampedIdx(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const state = window.history.state as Record<string, unknown> | null;
  const value = state?.[KEY];
  return typeof value === "number" ? value : undefined;
}

function stamp(idx: number): void {
  window.history.replaceState({ ...window.history.state, [KEY]: idx }, "");
}

/** Capture the app's entry point as the baseline position. Idempotent — only the first
 *  call counts. Call once at app load. */
export function captureHistoryBaseline(): void {
  if (baselineIdx !== null || typeof window === "undefined") return;
  const existing = stampedIdx();
  if (existing === undefined) {
    stamp(0);
    baselineIdx = currentIdx = maxIdx = 0;
  } else {
    baselineIdx = currentIdx = existing;
    maxIdx = Math.max(maxIdx, existing);
  }
}

/** Reconcile the current position after a navigation — a forward push (Next assigns no
 *  index, so we mint the next one) or a back/forward popstate (the entry is already
 *  stamped, so we adopt its index). Safe to call more than once per navigation. */
export function markNavigation(): void {
  if (typeof window === "undefined" || baselineIdx === null) return;
  const existing = stampedIdx();
  if (existing === undefined) {
    currentIdx = ++maxIdx;
    stamp(currentIdx);
  } else {
    currentIdx = existing;
  }
}

/** True only while the current position is deeper than the app's entry point — i.e.
 *  there is an in-app page to go back to, not an external page or the cold-entry page
 *  itself. */
export function hasInAppHistory(): boolean {
  if (typeof window === "undefined" || baselineIdx === null) return false;
  return currentIdx > baselineIdx;
}
