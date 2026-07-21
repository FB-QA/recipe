/**
 * Review-response round 6 — Codex on c9bbd8d: gas-mark range approximate leak,
 * and the compact hyphenated dimension form. Plus a documented-limitation pin
 * for hyphen-separated dimension RANGES (out of AC6 scope; safe empty result).
 */

import { describe, it, expect } from "vitest";
import { convert } from "./measurement-converter";

describe("review6 · gas-mark ranges: either endpoint off-table ⇒ approximate", () => {
  it("180–185°C → approximate (upper snapped from a non-table temp)", () => {
    const r = convert({ quantity: 180, quantityMax: 185, fromUnit: "celsius", toUnit: "gas_mark" });
    expect(r.approximate).toBe(true);
    expect(r.convertedQuantity).toBe(4);
    expect(r.convertedQuantityMax).toBe(4);
  });
  it("180–190°C → exact (both endpoints on-table)", () => {
    const r = convert({ quantity: 180, quantityMax: 190, fromUnit: "celsius", toUnit: "gas_mark" });
    expect(r.approximate).toBe(false);
    expect(r.convertedQuantityMax).toBe(5);
  });
  it("an off-table range is refused under allowApproximate:false", () => {
    expect(
      convert({ quantity: 180, quantityMax: 185, fromUnit: "celsius", toUnit: "gas_mark", allowApproximate: false })
        .error,
    ).toBe("UNSUPPORTED_CONVERSION");
  });
});
