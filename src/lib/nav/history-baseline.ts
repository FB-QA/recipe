/**
 * In-app navigation depth — so a "Back" control can tell a genuine in-app back from a
 * cold entry (a deep link or shared URL) without popping the user out to whatever
 * external page preceded the app.
 *
 * `window.history.length` counts the WHOLE tab session — including pages visited before
 * the app was ever opened (an in-app browser or link preview commonly reuses a tab that
 * already has history) — so on its own it cannot answer "did WE push this entry?".
 *
 * We capture the length once, when the app's document first loads ({@link
 * captureHistoryBaseline}, called at the root), and treat any growth beyond it as our
 * own client navigations. A full reload starts a new document and re-captures, which is
 * correct: a reload has no in-app back either.
 *
 * The baseline is a module singleton — it persists across client navigations (the bundle
 * stays loaded) and resets only on a full document load.
 */
let baseline: number | null = null;

/** Record the history depth at app load. Idempotent — only the first call counts, so it
 *  reflects the moment the document loaded, not some later navigation. */
export function captureHistoryBaseline(): void {
  if (baseline === null && typeof window !== "undefined") baseline = window.history.length;
}

/** True when the app has pushed at least one history entry since it loaded — i.e. there
 *  is an in-app page to return to. False before the baseline is captured, and false for a
 *  cold entry where nothing in-app has been navigated yet. */
export function hasInAppHistory(): boolean {
  if (typeof window === "undefined" || baseline === null) return false;
  return window.history.length > baseline;
}
