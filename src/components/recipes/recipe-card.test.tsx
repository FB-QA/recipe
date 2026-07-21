import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RecipeCard } from "./recipe-card";
import type { RecipeListItem } from "@/lib/recipes/queries";

function makeRecipe(overrides: Partial<RecipeListItem> = {}): RecipeListItem {
  return {
    id: "r1",
    title: "Greek Chicken Burgers",
    servings: "4",
    source_type: "manual",
    source_handle: null,
    is_favourite: false,
    tags: [],
    coverUrl: null,
    ingredientCount: 8,
    cook_time: "25 min",
    ...overrides,
  };
}

describe("RecipeCard", () => {
  it("shows the cooking time when present", () => {
    render(<RecipeCard recipe={makeRecipe({ cook_time: "25 min" })} />);
    expect(screen.getByText("25 min")).toBeInTheDocument();
  });

  it("omits the cooking time when the recipe has none", () => {
    render(<RecipeCard recipe={makeRecipe({ cook_time: null })} />);
    expect(screen.queryByText(/min/)).not.toBeInTheDocument();
  });

  it("clamps the title to a reserved two lines so cards stay uniform", () => {
    render(<RecipeCard recipe={makeRecipe({ title: "A".repeat(120) })} />);
    const heading = screen.getByRole("heading", { level: 3 });
    // line-clamp-2 gives the ellipsis; the reserved min-height keeps a one-line
    // title the same height as a two-line one, so the grid never staggers.
    expect(heading.className).toContain("line-clamp-2");
    expect(heading.className).toMatch(/min-h-\[2/);
  });
});
