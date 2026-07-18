import { describe, expect, it } from "vitest";
import { htmlToText, interpretWebsiteHtml, websiteFailureFor, siteNameFromUrl, websiteImageUrl } from "./website";

function jsonLdPage(extra = ""): string {
  const ld = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "One-Pan Orzo",
    recipeIngredient: ["500g chicken thighs", "250g orzo", "1 lemon"],
    recipeInstructions: [
      { "@type": "HowToStep", text: "Brown the chicken." },
      { "@type": "HowToStep", text: "Add orzo, simmer 12 min." },
    ],
    recipeYield: "4 servings",
    prepTime: "PT10M",
    cookTime: "PT20M",
  };
  return `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>${extra}</body></html>`;
}

describe("interpretWebsiteHtml — deterministic JSON-LD first (AC1)", () => {
  it("returns a deterministicRecipe and no AI text when JSON-LD is complete", () => {
    const seen = interpretWebsiteHtml(jsonLdPage());
    expect(seen.deterministicRecipe?.title).toBe("One-Pan Orzo");
    expect(seen.deterministicRecipe?.ingredientGroups[0].ingredients).toHaveLength(3);
    expect(seen.retrievalStatus).toBe("complete");
    expect(seen.caption).toBeNull(); // AI is skipped — no text carried
    expect(seen.failure).toBeNull();
  });

  it("falls back to page text (never raw HTML) when there is no usable JSON-LD", () => {
    const page = "<html><body><h1>Grandma's stew</h1><p>500g beef, 2 carrots. Simmer for an hour.</p><script>tracking()</script></body></html>";
    const seen = interpretWebsiteHtml(page);
    expect(seen.deterministicRecipe).toBeNull();
    expect(seen.caption).toContain("Grandma");
    expect(seen.caption).not.toContain("<");
    expect(seen.caption).not.toContain("tracking");
    expect(seen.warnings).toContain("unknown_completeness");
    expect(seen.retrievalStatus).toBe("partial");
  });

  it("skips incomplete JSON-LD (no steps) and falls through to text", () => {
    const partial = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "Recipe",
      name: "Half a recipe",
      recipeIngredient: ["flour"],
    })}</script></head><body>flour and water, bake it</body></html>`;
    const seen = interpretWebsiteHtml(partial);
    expect(seen.deterministicRecipe).toBeNull();
    expect(seen.caption).toContain("flour");
  });
});

describe("websiteFailureFor — fetch-outcome mapping", () => {
  it("maps each defensive-fetch kind to its failure reason", () => {
    expect(websiteFailureFor("timeout")).toBe("source_timeout");
    expect(websiteFailureFor("too_large")).toBe("source_too_large");
    expect(websiteFailureFor("unsafe")).toBe("unsupported_source");
    expect(websiteFailureFor("network")).toBe("source_retrieval_failed");
  });
});

describe("siteNameFromUrl — the domain label for attribution", () => {
  it("derives the site name from the host, dropping www + TLD", () => {
    expect(siteNameFromUrl("https://www.bbcgoodfood.com/recipes/x")).toBe("bbcgoodfood");
    expect(siteNameFromUrl("https://cooking.nytimes.com/recipes/y")).toBe("nytimes");
    expect(siteNameFromUrl("https://www.bbc.co.uk/food/z")).toBe("bbc");
  });
});

describe("websiteImageUrl — cover from JSON-LD then og:image", () => {
  it("prefers the JSON-LD recipe image", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "Recipe", name: "X", recipeIngredient: ["a"], recipeInstructions: ["b"], image: "https://img.test/dish.jpg" })}</script>`;
    expect(websiteImageUrl(html)).toBe("https://img.test/dish.jpg");
    expect(interpretWebsiteHtml(html).imageUrl).toBe("https://img.test/dish.jpg");
  });
  it("falls back to og:image", () => {
    expect(websiteImageUrl(`<meta property="og:image" content="https://img.test/og.jpg" />`)).toBe("https://img.test/og.jpg");
  });
});

describe("htmlToText", () => {
  it("strips scripts, styles and tags", () => {
    expect(htmlToText("<style>x{}</style><p>Hello <b>there</b></p><script>bad()</script>")).toBe("Hello there");
  });
});
