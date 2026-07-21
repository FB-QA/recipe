import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CookSections } from "./cook-sections";
import type { IngredientLike } from "@/lib/recipes/ingredient";
import type { MethodStep } from "./method-steps";

// Keep jsdom light and make the drawer deterministic.
vi.mock("@/components/grocery/add-to-list-sheet", () => ({ AddToListSheet: () => null }));
vi.mock("@/components/food-icons", () => ({ FoodImage: () => null }));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div data-testid="sheet">{children}</div> : null),
}));

const combobox = () => screen.getByRole("combobox", { name: /measurement units/i });
const setSystem = (v: string) => fireEvent.change(combobox(), { target: { value: v } });

describe("CookSections integration", () => {
  it("method-only recipe: the selector shows and converts step temperatures", () => {
    const steps: MethodStep[] = [
      { id: "s1", title: null, instruction: "Bake at 350°F for 20 minutes.", ingredients: [], terms: [] },
    ];
    render(
      <CookSections recipeId="r1" ingredients={[]} servingsText={null} addedIngredientIds={[]} steps={steps} />,
    );
    // Selector present even with no ingredient list.
    expect(combobox()).toBeInTheDocument();
    // Instruction text is split into spans by highlightStep — match the container.
    expect(document.body).toHaveTextContent(/Bake at 350°F for 20 minutes\./);
    setSystem("metric");
    expect(document.body).toHaveTextContent(/Bake at 175°C for 20 minutes\./);
  });

  it("converts a temperature RANGE in a step without mixing scales", () => {
    const steps: MethodStep[] = [
      { id: "s1", title: null, instruction: "Roast at 180–200°C.", ingredients: [], terms: [] },
    ];
    render(<CookSections recipeId="r1" ingredients={[]} servingsText={null} addedIngredientIds={[]} steps={steps} />);
    setSystem("us");
    expect(document.body).toHaveTextContent(/Roast at 350–400°F\./);
  });

  it("preserves preparation in the method drawer across a system switch", () => {
    const steps: MethodStep[] = [
      {
        id: "s1",
        title: null,
        instruction: "Fold in the pecans.",
        terms: ["pecans"],
        ingredients: [
          { id: "i1", display_text: "100 g pecans, toasted", quantity: null, unit: "g", name: "pecans", quantity_value: 100, preparation: "toasted" },
        ],
      },
    ];
    render(<CookSections recipeId="r1" ingredients={[]} servingsText={null} addedIngredientIds={[]} steps={steps} />);
    setSystem("us");
    fireEvent.click(screen.getByRole("button", { name: /ingredients for step 1/i }));
    const sheet = screen.getByTestId("sheet");
    expect(within(sheet).getByText(/pecans, toasted$/)).toBeInTheDocument();
  });

  it("the method drawer carries the measurement + portion controls", () => {
    const steps: MethodStep[] = [
      {
        id: "s1",
        title: null,
        instruction: "Add the vanilla.",
        terms: ["vanilla"],
        ingredients: [
          { id: "i1", display_text: "2 tsp vanilla", quantity: null, unit: "tsp", name: "vanilla", quantity_value: 2 },
        ],
      },
    ];
    render(
      <CookSections
        recipeId="r1"
        ingredients={[]}
        servingsText="4"
        addedIngredientIds={[]}
        sourceRegion="metric"
        steps={steps}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ingredients for step 1/i }));
    const sheet = screen.getByTestId("sheet");
    // Original in the drawer.
    expect(within(sheet).getByText("2 tsp vanilla")).toBeInTheDocument();
    // Change measurement FROM INSIDE the drawer.
    fireEvent.change(within(sheet).getByRole("combobox", { name: /measurement units/i }), {
      target: { value: "metric" },
    });
    expect(within(sheet).getByText("10 ml vanilla")).toBeInTheDocument();
    // The portion stepper is here too.
    expect(within(sheet).getByRole("button", { name: /more portions/i })).toBeInTheDocument();
  });

  it("Original mode scales BOTH endpoints of a range when portions change", () => {
    const ingredients: IngredientLike[] = [
      { id: "i1", display_text: "1–2 tbsp oil", quantity: null, unit: "tbsp", name: "oil", quantity_min: 1, quantity_max: 2 },
    ];
    render(
      <CookSections recipeId="r1" ingredients={ingredients} servingsText="4" addedIngredientIds={[]} steps={[]} />,
    );
    expect(screen.getByText("1–2 tbsp oil")).toBeInTheDocument();
    // Double the portions (4 → 8).
    fireEvent.click(screen.getByRole("button", { name: /more portions/i }));
    fireEvent.click(screen.getByRole("button", { name: /more portions/i }));
    fireEvent.click(screen.getByRole("button", { name: /more portions/i }));
    fireEvent.click(screen.getByRole("button", { name: /more portions/i }));
    expect(screen.getByText("2–4 tbsp oil")).toBeInTheDocument();
  });

  it("repeated portion + system switching restores the exact original", () => {
    const ingredients: IngredientLike[] = [
      { id: "i1", display_text: "8 oz butter", quantity: null, unit: "oz", name: "butter", quantity_value: 8 },
    ];
    render(
      <CookSections recipeId="r1" ingredients={ingredients} servingsText="4" addedIngredientIds={[]} steps={[]} />,
    );
    setSystem("metric");
    expect(screen.getByText("227 g butter")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /more portions/i })); // 4 → 5
    setSystem("original");
    fireEvent.click(screen.getByRole("button", { name: /fewer portions/i })); // 5 → 4
    expect(screen.getByText("8 oz butter")).toBeInTheDocument();
  });

  it("announces the measurement change via a live region", () => {
    render(<CookSections recipeId="r1" ingredients={[]} servingsText={null} addedIngredientIds={[]} steps={[{ id: "s1", title: null, instruction: "Mix.", ingredients: [], terms: [] }]} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/Measurements shown as Original\./);
    setSystem("us");
    expect(status).toHaveTextContent(/Measurements shown as US customary\./);
  });
});
