import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test.describe("M4 — polish", () => {
  test("theme toggle sets and persists a dark theme", async ({ page }) => {
    await signUp(page);
    await page.goto("/profile");
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("the Meal Plan tab shows a coming-soon state", async ({ page }) => {
    await signUp(page);
    await page.getByRole("link", { name: "Plan" }).click();
    await expect(page).toHaveURL("/plan");
    await expect(page.getByRole("heading", { name: /coming soon/i })).toBeVisible();
  });

  test("serves an installable web app manifest", async ({ page }) => {
    const res = await page.request.get("/manifest.webmanifest");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.name).toBe("Cookdex");
    expect(body.display).toBe("standalone");
    expect(body.icons.length).toBeGreaterThan(0);
  });

  test("unknown routes render the not-found page", async ({ page }) => {
    await signUp(page);
    await page.goto("/this-does-not-exist");
    await expect(page.getByRole("heading", { name: /couldn't find that/i })).toBeVisible();
  });
});
