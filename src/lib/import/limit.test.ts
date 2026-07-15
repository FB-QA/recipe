import { describe, it, expect } from "vitest";
import { importCapReached, DAILY_IMPORT_LIMIT } from "./limit";

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
