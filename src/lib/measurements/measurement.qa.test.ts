/**
 * QA pass (Priya hat) — independent adversarial review of the Phase 1 engine,
 * read cold rather than derived from the verify/falsify suites. Its job is to
 * find what those passes missed and lock the fixes as regressions.
 *
 * Found: convert() rejected ALL negative quantities, but temperature legitimately
 * goes negative (freezer/chill instructions). The verify pass only tested oven
 * temps, so the gap was invisible. Fixed in measurement-converter.ts; these
 * regressions pin it.
 */

import { describe, it, expect } from "vitest";
import { convert } from "./measurement-converter";

describe("QA · negative temperatures are valid", () => {
  it("converts a −18°C freezer instruction to °F", () => {
    const r = convert({ quantity: -18, fromUnit: "celsius", toUnit: "fahrenheit" });
    expect(r.error).toBeUndefined();
    expect(r.convertedQuantity).toBeCloseTo(-0.4, 6); // -18*9/5+32
    expect(r.confidence).toBe("exact");
  });
  it("converts −40°F → −40°C (the crossover)", () => {
    const r = convert({ quantity: -40, fromUnit: "fahrenheit", toUnit: "celsius" });
    expect(r.error).toBeUndefined();
    expect(r.convertedQuantity).toBeCloseTo(-40, 6);
  });
  it("converts a negative temperature range end-to-end", () => {
    const r = convert({ quantity: -20, quantityMax: -15, fromUnit: "celsius", toUnit: "fahrenheit" });
    expect(r.convertedQuantity).toBeCloseTo(-4, 6);
    expect(r.convertedQuantityMax).toBeCloseTo(5, 6);
  });
});

describe("QA · negatives still rejected where they are meaningless", () => {
  it("rejects negative weight", () => {
    expect(convert({ quantity: -5, fromUnit: "g", toUnit: "kg" }).error).toBe("INVALID_QUANTITY");
  });
  it("rejects negative volume", () => {
    expect(convert({ quantity: -1, fromUnit: "cup", toUnit: "ml" }).error).toBe("INVALID_QUANTITY");
  });
  it("rejects negative length", () => {
    expect(convert({ quantity: -3, fromUnit: "cm", toUnit: "mm" }).error).toBe("INVALID_QUANTITY");
  });
  it("still rejects non-finite everywhere, including temperature", () => {
    expect(convert({ quantity: NaN, fromUnit: "celsius", toUnit: "fahrenheit" }).error).toBe("INVALID_QUANTITY");
  });
});
