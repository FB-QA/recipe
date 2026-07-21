import { describe, it, expect } from "vitest";
import { reduceMeasurementGroups } from "./measurement-annotations";

describe("reduceMeasurementGroups", () => {
  it("keeps only the metric member of a dual annotation", () => {
    expect(reduceMeasurementGroups("200g / 7 oz dried noodles", "metric")).toBe("200g dried noodles");
    expect(reduceMeasurementGroups("15 oz / 450g fresh noodles", "metric")).toBe("450g fresh noodles");
  });

  it("keeps only the US member of a dual annotation", () => {
    expect(reduceMeasurementGroups("200g / 7 oz dried noodles", "us")).toBe("7 oz dried noodles");
    expect(reduceMeasurementGroups("15 oz / 450g fresh noodles", "us")).toBe("15 oz fresh noodles");
  });

  it("reduces a triple annotation (cup / g / oz)", () => {
    expect(reduceMeasurementGroups("1 cup / 150g / 5oz chicken thighs", "metric")).toBe("150g chicken thighs");
    // First US member wins (cup before oz).
    expect(reduceMeasurementGroups("1 cup / 150g / 5oz chicken thighs", "us")).toBe("1 cup chicken thighs");
  });

  it("reduces every group in a line with an 'or' alternative", () => {
    const line = "200g / 7 oz dried wide rice stick noodles, or 15 oz / 450g fresh wide flat rice noodles (Note 1)";
    expect(reduceMeasurementGroups(line, "metric")).toBe(
      "200g dried wide rice stick noodles, or 450g fresh wide flat rice noodles (Note 1)",
    );
  });

  it("leaves single-measurement lines untouched", () => {
    expect(reduceMeasurementGroups("2 tsp dark soy sauce", "metric")).toBe("2 tsp dark soy sauce");
    expect(reduceMeasurementGroups("3 tbsp peanut or vegetable oil, separated", "us")).toBe(
      "3 tbsp peanut or vegetable oil, separated",
    );
  });

  it("leaves a group whole when it has no member in the target system", () => {
    // Two US units, no metric member → keep as written for metric.
    expect(reduceMeasurementGroups("1 cup / 5 oz nuts", "metric")).toBe("1 cup / 5 oz nuts");
  });

  it("does not mistake a fraction like 1/2 for a group separator", () => {
    expect(reduceMeasurementGroups("1/2 cup milk", "metric")).toBe("1/2 cup milk");
  });

  it("keeps a mixed unicode fraction whole (no orphaned leading digit)", () => {
    // "1½ cups / 350 g flour" must not reduce to "1350 g flour".
    expect(reduceMeasurementGroups("1½ cups / 350 g flour", "metric")).toBe("350 g flour");
  });

  it("selects the right member when a typed fraction is inside a group", () => {
    // "1/2 cup / 120 ml milk" must not reduce to "1 milk".
    expect(reduceMeasurementGroups("1/2 cup / 120 ml milk", "metric")).toBe("120 ml milk");
    expect(reduceMeasurementGroups("1/2 cup / 120 ml milk", "us")).toBe("1/2 cup milk");
  });

  it("recognises spelled-out units in a dual annotation", () => {
    expect(reduceMeasurementGroups("1 cup / 240 millilitres milk", "metric")).toBe("240 millilitres milk");
    expect(reduceMeasurementGroups("240 millilitres / 8 fluid ounces milk", "us")).toBe("8 fluid ounces milk");
  });

  it("reduces a dual annotation with a period on an abbreviation ('1 tbsp.')", () => {
    expect(reduceMeasurementGroups("1 tbsp. / 15 ml oil", "metric")).toBe("15 ml oil");
  });

  it("reduces a dual annotation whose members are ranges", () => {
    expect(reduceMeasurementGroups("200–250 g / 7–9 oz chicken", "us")).toBe("7–9 oz chicken");
    expect(reduceMeasurementGroups("200–250 g / 7–9 oz chicken", "metric")).toBe("200–250 g chicken");
  });
});
