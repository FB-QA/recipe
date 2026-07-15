import { describe, it, expect } from "vitest";
import { coverImagePath, recipeMediaFolder, coverFolder } from "@/lib/images/paths";

describe("coverImagePath", () => {
  it("builds the per-image cover path under the recipe's cover folder", () => {
    expect(coverImagePath("user-1", "recipe-9", "img-4")).toBe(
      "user-1/recipes/recipe-9/cover/img-4.webp",
    );
  });

  it("keeps the user id as the first path segment (RLS keys on it)", () => {
    const path = coverImagePath("7f3a-user", "91ab-recipe", "4d8c-image");
    expect(path.split("/")[0]).toBe("7f3a-user");
  });
});

describe("recipeMediaFolder", () => {
  it("is the recipe's media root prefix (covers live under it)", () => {
    expect(recipeMediaFolder("user-1", "recipe-9")).toBe("user-1/recipes/recipe-9");
  });

  it("is a prefix of every cover image path for the same recipe", () => {
    const folder = recipeMediaFolder("user-1", "recipe-9");
    const image = coverImagePath("user-1", "recipe-9", "whatever");
    expect(image.startsWith(folder + "/")).toBe(true);
  });
});

describe("coverFolder", () => {
  it("is the folder Supabase list() enumerates to find cover files", () => {
    expect(coverFolder("user-1", "recipe-9")).toBe("user-1/recipes/recipe-9/cover");
  });
});
