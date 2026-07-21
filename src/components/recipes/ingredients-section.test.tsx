import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { IngredientsSection } from "./ingredients-section";
import type { IngredientLike } from "@/lib/recipes/ingredient";
import type { MeasurementSystem } from "@/lib/measurements";

// Keep the render light — the grocery sheet + food icons pull in unrelated deps.
vi.mock("@/components/grocery/add-to-list-sheet", () => ({ AddToListSheet: () => null }));
vi.mock("@/components/food-icons", () => ({ FoodImage: () => null }));

const flour: IngredientLike = {
  id: "i1",
  display_text: "1 cup flour",
  quantity: "1",
  unit: "cup",
  name: "flour",
  quantity_value: 1,
  quantity_min: null,
  quantity_max: null,
};

function Harness({ region }: { region?: "us" }) {
  const [system, setSystem] = useState<MeasurementSystem>("original");
  return (
    <IngredientsSection
      recipeId="r1"
      ingredients={[flour]}
      addedIngredientIds={[]}
      base={4}
      target={4}
      setTarget={() => {}}
      scale={1}
      system={system}
      setSystem={setSystem}
      sourceRegion={region}
    />
  );
}

describe("IngredientsSection measurement toggle", () => {
  it("shows the original line, then converts a known-region cup to ml on switch", () => {
    render(<Harness region="us" />);
    expect(screen.getByText("1 cup flour")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: /measurement units/i }), {
      target: { value: "metric" },
    });
    expect(screen.getByText("237 ml flour")).toBeInTheDocument();
    expect(screen.queryByText("1 cup flour")).not.toBeInTheDocument();
  });

  it("restores the exact original when switched back", () => {
    render(<Harness region="us" />);
    const select = screen.getByRole("combobox", { name: /measurement units/i });
    fireEvent.change(select, { target: { value: "metric" } });
    fireEvent.change(select, { target: { value: "original" } });
    expect(screen.getByText("1 cup flour")).toBeInTheDocument();
  });

  it("keeps a region-sensitive unit as original when the region is unknown", () => {
    render(<Harness region={undefined} />);
    fireEvent.change(screen.getByRole("combobox", { name: /measurement units/i }), {
      target: { value: "metric" },
    });
    // No region → cup stays original rather than guessing US vs metric.
    expect(screen.getByText("1 cup flour")).toBeInTheDocument();
  });
});
