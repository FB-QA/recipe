import { describe, it, expect } from "vitest";
import { formatQuantityValue } from "./quantity-formatter";

describe("formatQuantityValue", () => {
  it("snaps a near-whole value to the whole (small relative nudge)", () => {
    expect(formatQuantityValue(7.0548)).toBe("7");
  });

  it("renders friendly fractions", () => {
    expect(formatQuantityValue(0.5)).toBe("½");
    expect(formatQuantityValue(1.5)).toBe("1½");
    expect(formatQuantityValue(0.25)).toBe("¼");
  });

  it("keeps a genuine decimal rather than overstating it as a fraction", () => {
    // 0.2 tsp must not become ¼ (a 25% overstatement).
    expect(formatQuantityValue(0.2)).toBe("0.2");
  });

  it("renders a true zero as 0", () => {
    expect(formatQuantityValue(0)).toBe("0");
  });

  it("never rounds a NONZERO quantity down to 0", () => {
    // 0.01 is small but real — snapping it to the whole 0 would erase it.
    expect(formatQuantityValue(0.01)).not.toBe("0");
    expect(Number(formatQuantityValue(0.01))).toBeCloseTo(0.01, 5);
    // Even smaller — still must show a nonzero figure.
    expect(Number(formatQuantityValue(0.004))).toBeGreaterThan(0);
  });
});
