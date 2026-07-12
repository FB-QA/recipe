import { describe, it, expect, vi, afterEach } from "vitest";
import { importFromUrl, isInstagramUrl } from "@/lib/import/pipeline";

const RECIPE_HTML = `<html><head><script type="application/ld+json">${JSON.stringify({
  "@type": "Recipe",
  name: "Miso Butter Udon",
  recipeYield: "4",
  recipeIngredient: ["udon noodles", "miso", "butter"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Boil the noodles." }, { "@type": "HowToStep", text: "Toss with miso butter." }],
})}</script></head><body></body></html>`;

afterEach(() => vi.unstubAllGlobals());

describe("isInstagramUrl", () => {
  it("recognises instagram hosts", () => {
    expect(isInstagramUrl("https://www.instagram.com/reel/ABC/")).toBe(true);
    expect(isInstagramUrl("https://instagram.com/p/XYZ/")).toBe(true);
    expect(isInstagramUrl("https://bbcgoodfood.com/recipes/x")).toBe(false);
    expect(isInstagramUrl("not a url")).toBe(false);
  });
});

describe("importFromUrl — website deterministic path", () => {
  it("extracts via JSON-LD with zero cost and no AI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(RECIPE_HTML, { status: 200 })),
    );

    const outcome = await importFromUrl("https://example.com/recipes/udon");
    expect(outcome.status).toBe("success");
    if (outcome.status === "success") {
      expect(outcome.method).toBe("jsonld");
      expect(outcome.costCents).toBe(0);
      expect(outcome.recipe.title).toBe("Miso Butter Udon");
      expect(outcome.recipe.ingredients).toHaveLength(3);
    }
  });

  it("fails gracefully when the page can't be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("blocked", { status: 403 })),
    );
    const outcome = await importFromUrl("https://walled.example.com/recipe");
    expect(outcome.status).toBe("failed");
  });
});
