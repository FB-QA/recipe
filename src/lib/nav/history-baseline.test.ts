import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "__cookdexHistIdx";

// Fresh module state per test — the trackers are module singletons by design.
async function freshModule() {
  vi.resetModules();
  return import("./history-baseline");
}

/** Simulate a Next forward push: a brand-new entry whose state carries no index. */
function simulatePush() {
  window.history.pushState({}, "");
}

/** Simulate landing (via back/forward popstate) on an entry already stamped `idx`. */
function simulateReturnTo(idx: number) {
  window.history.replaceState({ [KEY]: idx }, "");
}

describe("history position tracking", () => {
  beforeEach(() => {
    // Reset to a clean, unstamped entry before each test.
    window.history.replaceState({}, "");
  });

  it("reports no in-app history before the baseline is captured", async () => {
    const { hasInAppHistory } = await freshModule();
    expect(hasInAppHistory()).toBe(false);
  });

  it("reports in-app history after a forward push, and NOT before", async () => {
    const { captureHistoryBaseline, markNavigation, hasInAppHistory } = await freshModule();
    captureHistoryBaseline();
    expect(hasInAppHistory()).toBe(false); // sitting on the entry point
    simulatePush();
    markNavigation();
    expect(hasInAppHistory()).toBe(true);
  });

  it("stops reporting in-app history once the user returns to the entry point — position, not length", async () => {
    // This is the high-water-mark bug: length would still be inflated here and wrongly
    // say "yes". Position must say "no" — we are back at the baseline.
    const { captureHistoryBaseline, markNavigation, hasInAppHistory } = await freshModule();
    captureHistoryBaseline(); // baseline idx 0
    simulatePush();
    markNavigation(); // idx 1
    expect(hasInAppHistory()).toBe(true);
    simulateReturnTo(0); // browser Back to the entry point
    markNavigation();
    expect(hasInAppHistory()).toBe(false);
  });

  it("does not count a busy tab's prior history as in-app (cold entry into an existing tab)", async () => {
    // The tab already had entries, but the app's entry point is still the baseline. No
    // in-app navigation has happened, so there is nothing of ours to go back to.
    const { captureHistoryBaseline, hasInAppHistory } = await freshModule();
    captureHistoryBaseline();
    expect(hasInAppHistory()).toBe(false);
  });

  it("adopts an existing stamp as the baseline rather than resetting it", async () => {
    simulateReturnTo(5); // e.g. a state restored with our stamp already present
    const { captureHistoryBaseline, hasInAppHistory } = await freshModule();
    captureHistoryBaseline();
    expect(hasInAppHistory()).toBe(false); // currentIdx === baseline (5)
  });
});
