import { describe, it, expect } from "vitest";
import { importCapReached, windowCutoff, DAILY_IMPORT_LIMIT, IMPORT_WINDOW_MS } from "./limit";

describe("importCapReached", () => {
  it("allows imports below the daily cap", () => {
    expect(importCapReached(0, false)).toBe(false);
    expect(importCapReached(DAILY_IMPORT_LIMIT - 1, false)).toBe(false);
  });

  it("blocks at and above the daily cap", () => {
    expect(importCapReached(DAILY_IMPORT_LIMIT, false)).toBe(true);
    expect(importCapReached(DAILY_IMPORT_LIMIT + 10, false)).toBe(true);
  });

  it("never blocks an exempt user, regardless of count", () => {
    expect(importCapReached(DAILY_IMPORT_LIMIT, true)).toBe(false);
    expect(importCapReached(DAILY_IMPORT_LIMIT * 40, true)).toBe(false);
  });

  it("treats a missing count as zero", () => {
    expect(importCapReached(null, false)).toBe(false);
  });
});

describe("windowCutoff", () => {
  it("sits exactly one window before the given moment", () => {
    const now = Date.UTC(2026, 6, 15, 12, 0, 0);
    expect(windowCutoff(now)).toBe(new Date(now - IMPORT_WINDOW_MS).toISOString());
    expect(windowCutoff(now)).toBe("2026-07-14T12:00:00.000Z");
  });
});
