import { test, expect, type Page } from "@playwright/test";
import { signUp, JSONLD_FIXTURE } from "./helpers";

// Mobile-first guard: nothing may overflow the viewport horizontally. Runs at
// the project's 390px mobile viewport.

async function overflow(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const sw = document.documentElement.scrollWidth;
    const offenders = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > vw + 1;
      })
      .slice(0, 8)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const cls = (el.getAttribute("class") || "").split(" ").slice(0, 2).join(".");
        return `${el.tagName.toLowerCase()}.${cls} w=${Math.round(r.width)} right=${Math.round(r.right)}`;
      });
    return { vw, sw, offenders };
  });
}

async function expectNoOverflow(page: Page, label: string) {
  const { vw, sw, offenders } = await overflow(page);
  expect(sw, `overflow on ${label}: vw=${vw} sw=${sw}\n  ${offenders.join("\n  ")}`).toBeLessThanOrEqual(
    vw + 1,
  );
}

const PAGES = ["/", "/list", "/plan", "/profile", "/add", "/import?source=web", "/paste", "/recipes/new"];

test.describe("mobile-fit — no horizontal overflow", () => {
  for (const route of PAGES) {
    test(`page ${route} fits`, async ({ page }) => {
      await signUp(page);
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await expectNoOverflow(page, route);
    });
  }

  test("add drawer (menu + import review) fits", async ({ page }) => {
    await signUp(page);
    await page.getByRole("button", { name: "Add a recipe" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoOverflow(page, "add drawer menu");

    // Grow into the website import flow, run the fixture, land on the review.
    await page.getByRole("button", { name: /Import from website/i }).click();
    await expectNoOverflow(page, "add drawer import input");
    await page.getByLabel("Recipe link").fill(JSONLD_FIXTURE);
    await page.getByRole("button", { name: "Get the recipe" }).click();
    await expect(page.getByLabel("Title")).toHaveValue("Greek Salad");
    await expectNoOverflow(page, "add drawer import review");
  });

  test("add-to-list sheet fits", async ({ page }) => {
    await signUp(page);
    await page.goto("/recipes/new");
    await page.getByLabel("Title").fill("Salad With A Fairly Long Title To Test Wrapping");
    await page.getByRole("textbox", { name: "Ingredients 1" }).fill("2 large handfuls fresh flat-leaf parsley, finely chopped");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByRole("heading", { name: /Salad With A Fairly Long Title/ })).toBeVisible();
    await expectNoOverflow(page, "recipe detail");

    await page.getByRole("button", { name: "Add to grocery list" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoOverflow(page, "add-to-list sheet");
  });
});
