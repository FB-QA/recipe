import { describe, it, expect } from "vitest";
import { parseRecipePayload } from "@/lib/recipes/schema";

describe("parseRecipePayload", () => {
  it("accepts a minimal valid recipe", () => {
    const r = parseRecipePayload({
      title: "Toast",
      ingredients: [{ display_text: "2 slices bread" }],
      steps: [{ instruction: "Toast the bread." }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty title", () => {
    expect(parseRecipePayload({ title: "" }).success).toBe(false);
    expect(parseRecipePayload({ title: "   " }).success).toBe(false);
  });

  it("coerces empty optional text to null (no awkward empty strings stored)", () => {
    const r = parseRecipePayload({ title: "X", servings: "", prep_time: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.servings).toBeNull();
      expect(r.data.prep_time).toBeNull();
    }
  });

  it("drops an empty source_url to null but rejects a malformed one", () => {
    const ok = parseRecipePayload({ title: "X", source_url: "" });
    expect(ok.success && ok.data.source_url).toBeNull();
    expect(parseRecipePayload({ title: "X", source_url: "not a url" }).success).toBe(false);
  });

  it("accepts verbose free-text times/servings from imports (regression: 60-char cap)", () => {
    const r = parseRecipePayload({
      title: "Chia Puddings",
      cook_time: "5-10 minutes for the strawberries, plus 1 hour or overnight soaking",
      servings: "2 large portions",
    });
    expect(r.success).toBe(true);
  });

  it("defaults collections to empty arrays", () => {
    const r = parseRecipePayload({ title: "X" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.ingredients).toEqual([]);
      expect(r.data.tags).toEqual([]);
    }
  });
});
