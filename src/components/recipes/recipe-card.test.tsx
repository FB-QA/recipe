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
    thumbUrl: null,
    ingredientCount: 8,
    cook_time: "25 min",
    ...overrides,
  };
}

const coverImg = (recipe: RecipeListItem) =>
  render(<RecipeCard recipe={recipe} />).container.querySelector("img") as HTMLImageElement | null;

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

  it("uses the lightweight thumb on the shelf when one exists", () => {
    const img = coverImg(makeRecipe({ coverUrl: "https://s/cover.webp", thumbUrl: "https://s/thumb.webp" }));
    expect(img?.getAttribute("src")).toBe("https://s/thumb.webp");
  });

  it("falls back to the full cover for recipes with no thumb yet", () => {
    const img = coverImg(makeRecipe({ coverUrl: "https://s/cover.webp", thumbUrl: null }));
    expect(img?.getAttribute("src")).toBe("https://s/cover.webp");
  });

  it("lazy-loads the shelf image so an off-screen card costs nothing until scrolled to", () => {
    const img = coverImg(makeRecipe({ coverUrl: "https://s/cover.webp", thumbUrl: "https://s/thumb.webp" }));
    expect(img?.getAttribute("loading")).toBe("lazy");
  });
});
