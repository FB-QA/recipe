import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

/**
 * A skeleton exists to hold the page's shape while it loads. If it holds the WRONG
 * shape, it is worse than nothing: the content lands and everything jumps.
 *
 * Review caught exactly that on the recipe detail page — the skeleton drew a 200px
 * rounded cover inset within the page padding, against a real cover that is 250px,
 * square and full-bleed. It would have grown, shifted sideways, and moved the title.
 *
 * So the shape is asserted, not eyeballed. The skeleton's cover box is measured
 * while loading, the real one after, and they must agree.
 */

// The pixel budget for a shape that is supposed to be identical. Sub-pixel rounding
// and a border are fair; 50px of growth and a sideways shift are not.
const JUMP_TOLERANCE_PX = 4;

test.describe("loading skeletons hold the real page's shape", () => {
  test("the recipe cover does not move when the recipe lands", async ({ page }) => {
    await signUp(page);

    // Make a recipe to open.
    await page.goto("/recipes/new");
    await page.getByLabel("Title").fill("Shape Test Stew");
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+$/);
    const recipeUrl = page.url();

    // Hold the server so the skeleton is on screen long enough to measure. The RSC
    // payload is what a navigation waits on — delay it, and we see the loading state.
    await page.route("**/*", async (route) => {
      const isRsc = route.request().url().includes("_rsc=");
      if (isRsc) await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    await page.goto("/");
    await page.getByRole("link", { name: /Shape Test Stew/i }).click();

    // Measure the skeleton's cover while it is up.
    const skeletonCover = page.locator("div.skeleton").first();
    await expect(skeletonCover).toBeVisible();
    const before = await skeletonCover.boundingBox();
    expect(before, "the skeleton cover should be on screen").not.toBeNull();

    await page.unroute("**/*");

    // …then the real one.
    await expect(page).toHaveURL(recipeUrl);
    const realCover = page.getByRole("heading", { name: "Shape Test Stew" }).locator("..");
    await expect(realCover).toBeVisible();
    const after = await realCover.boundingBox();
    expect(after).not.toBeNull();

    // The cover must occupy the same box. This is what "no jump" means, measured.
    expect(Math.abs(before!.height - after!.height), "cover height jumped").toBeLessThanOrEqual(
      JUMP_TOLERANCE_PX,
    );
    expect(Math.abs(before!.width - after!.width), "cover width jumped").toBeLessThanOrEqual(
      JUMP_TOLERANCE_PX,
    );
    expect(Math.abs(before!.x - after!.x), "cover shifted sideways").toBeLessThanOrEqual(
      JUMP_TOLERANCE_PX,
    );
  });
});
