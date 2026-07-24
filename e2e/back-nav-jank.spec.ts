import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";

/** Create a recipe through the manual form so the shelf has enough cards to scroll. */
async function createRecipe(page: Page, title: string) {
  await page.goto("/recipes/new");
  await page.getByLabel("Title").fill(title);
  await page.getByPlaceholder("2 chicken breasts").fill("2 chicken breasts");
  await page.getByPlaceholder(/Describe this step/).fill("Cook it well.");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+$/);
}

test.describe("recipe → Back navigation", () => {
  test("tapping Back returns to the shelf without a redirect round-trip or scroll jump", async ({
    page,
  }) => {
    await signUp(page);
    for (let i = 1; i <= 6; i++) await createRecipe(page, `Reproduction recipe ${i}`);

    // Short viewport so a handful of cards is unambiguously scrollable.
    await page.setViewportSize({ width: 390, height: 520 });

    // On the shelf, scroll down so there is a position worth preserving.
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Reproduction recipe 1/i })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 600));
    const shelfScroll = await page.evaluate(() => window.scrollY);
    expect(shelfScroll, "sanity: the shelf must actually scroll").toBeGreaterThan(150);

    // Open a recipe.
    await page.getByRole("link", { name: /Reproduction recipe 1/i }).first().click();
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+$/);

    // Record every request to the /recipes redirect route from here on. A genuine
    // history-back to the shelf ("/") never asks the server for "/recipes".
    const recipesRedirectRequests: string[] = [];
    page.on("request", (req) => {
      const { pathname } = new URL(req.url());
      if (pathname === "/recipes") recipesRedirectRequests.push(req.url());
    });

    // Tap the in-app Back control.
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL("/");

    // TELL #1: Back should not route through the /recipes redirect — it should return
    // to the shelf we came from.
    expect(
      recipesRedirectRequests,
      "Back should not fetch the /recipes redirect route",
    ).toEqual([]);

    // TELL #2 (the visible jank): the shelf scroll position is restored, not reset to
    // the top. The bug forward-navigates and lands at 0; a true back restores the
    // position. We assert "clearly preserved" rather than an exact match — under `next
    // dev` the shelf refetches and its height reflows as images settle, so restoration
    // can land a little short. In production the Router Cache serves the shelf at full
    // height instantly and restoration is exact; here the meaningful contrast is 0 (the
    // jump) versus back near where we were.
    await expect
      .poll(() => page.evaluate(() => window.scrollY), {
        timeout: 3000,
        message: "shelf scroll position should survive Back (not reset to the top)",
      })
      .toBeGreaterThan(150);
  });
});
