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

  it("recognises an explicit US qualifier ('1 US cup') as US", () => {
    expect(detectSourceRegion({ units: ["cup"], instructions: ["Mix.", "1 US cup flour"] })).toBe("us");
  });

  it("stays undefined when a US qualifier conflicts with a UK cue", () => {
    expect(detectSourceRegion({ units: ["cup"], instructions: ["1 US cup flour", "Bake at Gas Mark 4."] })).toBeUndefined();
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
    // Both °F (US) and °C present, no metric anchor → ambiguous.
    expect(detectSourceRegion({ units: ["cup"], instructions: ["Bake at 180°C or 350°F."] })).toBeUndefined();
  });

  it("reads a gram-and-Celsius recipe as metric despite a courtesy °F", () => {
    // Real case: "Preheat to 180°C/350°F" + grams throughout is a metric recipe;
    // the /350°F is a dual annotation, not a US signal.
    expect(
      detectSourceRegion({
        units: [null, null],
        instructions: ["Preheat the oven to 180°C/350°F (160°C fan-forced).", "1 x 340g/12oz can milk"],
      }),
    ).toBe("metric");
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

  it("reads a grams/mm recipe as metric even with NO oven temperature (stovetop)", () => {
    // US recipes weigh in oz/lb and measure in inches — grams or mm identify a
    // metric-family recipe, so its cups/spoons still convert.
    expect(detectSourceRegion({ units: [], instructions: ["Weigh 500 g pork mince.", "Cut into 8mm wedges."] })).toBe("metric");
  });

  it("stays undefined for a cups-only recipe with no metric measure or temperature", () => {
    // No grams/mm, no oven temp, no qualifier — genuinely can't tell the region.
    expect(detectSourceRegion({ units: ["cup", "tbsp"], instructions: ["Mix 1 cup flour with 2 tbsp sugar."] })).toBeUndefined();
  });

  it("does NOT read a cup abbreviation ('1 c') as a Celsius cue", () => {
    // "1 c milk" is a US cup, not 1°C. A US recipe (°F) that also writes "1 c"
    // must stay US, not collapse to undefined on a phantom °F+°C conflict.
    expect(detectSourceRegion({ units: ["cup"], instructions: ["Bake at 350°F.", "Add 1 c milk."] })).toBe("us");
  });

  it("reads kilograms in unstructured text as a metric cue", () => {
    expect(detectSourceRegion({ units: [null], instructions: ["Weigh 1 kg flour."] })).toBe("metric");
  });

  it("reads milligrams in unstructured text as a metric cue", () => {
    expect(detectSourceRegion({ units: [null], instructions: ["Add 100 mg saffron threads."] })).toBe("metric");
  });

  it("is null-safe on empty input", () => {
    expect(detectSourceRegion({ units: [], instructions: [] })).toBeUndefined();
    expect(detectSourceRegion({ units: [null, undefined as never], instructions: [""] })).toBeUndefined();
  });
});
