import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setHistoryLength(n: number) {
  Object.defineProperty(window.history, "length", { configurable: true, value: n });
}

// Fresh module state per test — the baseline is a module singleton by design.
async function freshModule() {
  vi.resetModules();
  return import("./history-baseline");
}

describe("history baseline", () => {
  beforeEach(() => setHistoryLength(1));
  afterEach(() => setHistoryLength(1));

  it("reports no in-app history before the baseline is captured", async () => {
    const { hasInAppHistory } = await freshModule();
    expect(hasInAppHistory()).toBe(false);
  });

  it("reports in-app history once the tab has navigated beyond the load-time depth", async () => {
    setHistoryLength(1);
    const { captureHistoryBaseline, hasInAppHistory } = await freshModule();
    captureHistoryBaseline();
    expect(hasInAppHistory()).toBe(false); // nothing pushed yet
    setHistoryLength(2); // an in-app push
    expect(hasInAppHistory()).toBe(true);
  });

  it("does NOT count pre-existing tab history as in-app — the deep-link-into-a-busy-tab case", async () => {
    // Opened from an in-app browser / link preview: the tab already had history, so
    // length is > 1 at load. Without a baseline this would look like in-app history and
    // pop the user back out to the external site. It must not.
    setHistoryLength(6);
    const { captureHistoryBaseline, hasInAppHistory } = await freshModule();
    captureHistoryBaseline();
    expect(hasInAppHistory()).toBe(false);
    setHistoryLength(7); // now the app itself navigates once
    expect(hasInAppHistory()).toBe(true);
  });

  it("captures only once — a later call does not move the baseline", async () => {
    setHistoryLength(1);
    const { captureHistoryBaseline, hasInAppHistory } = await freshModule();
    captureHistoryBaseline();
    setHistoryLength(4);
    captureHistoryBaseline(); // ignored — baseline already set at 1
    expect(hasInAppHistory()).toBe(true);
  });
});
