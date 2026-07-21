import { describe, it, expect } from "vitest";
import { detectSourceRegion } from "./measurement-region";

describe("detectSourceRegion", () => {
  it("returns undefined when there is no strong signal (never guesses)", () => {
    expect(detectSourceRegion({ units: ["cup", "cups"], instructions: ["Mix well."] })).toBeUndefined();
  });

  it("reads Fahrenheit in instructions as US", () => {
    expect(detectSourceRegion({ units: ["cup"], instructions: ["Bake at 350°F."] })).toBe("us");
    expect(detectSourceRegion({ units: [], instructions: ["Preheat oven to 400 F"] })).toBe("us");
  });

  it("reads an explicit imperial pint as UK/Ireland", () => {
    expect(detectSourceRegion({ units: ["pint"], instructions: ["Add 1 imperial pint of stock."] })).toBe("uk_ie");
  });

  it("does NOT infer a region from a bare, unqualified pint (US and UK pints differ)", () => {
    expect(detectSourceRegion({ units: ["pint", "oz"], instructions: ["Add 1 pint stock."] })).toBeUndefined();
  });

  it("finds an imperial-pint cue in an ingredient line, not just the steps", () => {
    // page.tsx feeds ingredient display_text into the scan, since imports store
    // "imperial" in display_text while the unit is a bare "pint".
    expect(
      detectSourceRegion({ units: ["pint"], instructions: ["Simmer gently.", "1 imperial pint beef stock"] }),
    ).toBe("uk_ie");
  });

  it("reads clean metric (°C + grams, no Fahrenheit) as metric", () => {
    expect(detectSourceRegion({ units: ["g", "ml"], instructions: ["Bake at 180°C."] })).toBe("metric");
  });

  it("stays undefined on a conflicting/mixed signal rather than guessing", () => {
    // Both °F (US) and °C present → ambiguous.
    expect(detectSourceRegion({ units: ["cup"], instructions: ["Bake at 180°C or 350°F."] })).toBeUndefined();
  });

  it("stays undefined when a US cue and an imperial (UK) cue conflict", () => {
    // Fahrenheit (US) alongside an explicit imperial pint (UK) → can't tell.
    expect(
      detectSourceRegion({ units: ["pint"], instructions: ["Add 1 imperial pint. Bake at 350°F."] }),
    ).toBeUndefined();
  });

  it("treats a lone gas mark as a UK/Ireland signal", () => {
    expect(detectSourceRegion({ units: [], instructions: ["Bake at Gas Mark 6 for 25 minutes."] })).toBe("uk_ie");
    // Even alongside Celsius (both UK/IE-compatible).
    expect(detectSourceRegion({ units: ["g"], instructions: ["Gas Mark 6 (200°C)."] })).toBe("uk_ie");
  });

  it("stays undefined when a gas mark conflicts with Fahrenheit", () => {
    expect(detectSourceRegion({ units: [], instructions: ["Gas Mark 6 / 400°F."] })).toBeUndefined();
  });

  it("does not treat a lone gram as a region signal without a temperature", () => {
    expect(detectSourceRegion({ units: ["g"], instructions: ["Weigh 200 g."] })).toBeUndefined();
  });

  it("is null-safe on empty input", () => {
    expect(detectSourceRegion({ units: [], instructions: [] })).toBeUndefined();
    expect(detectSourceRegion({ units: [null, undefined as never], instructions: [""] })).toBeUndefined();
  });
});
