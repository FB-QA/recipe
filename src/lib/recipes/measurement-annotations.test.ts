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
});
