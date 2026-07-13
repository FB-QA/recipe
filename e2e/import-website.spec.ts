import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

// Drives the real deterministic (JSON-LD) import path against a local fixture,
// so it costs nothing and never hits an external site.
const FIXTURE = "http://localhost:3100/test-fixtures/greek-salad.html";

test.describe("M2 — website import", () => {
  test("import a recipe via JSON-LD, review it, and save it to the shelf", async ({ page }) => {
    await signUp(page);

    await page.goto("/import?source=web");
    await page.getByLabel("Recipe link").fill(FIXTURE);
    await page.getByRole("button", { name: "Get the recipe" }).click();

    // Editable review, prefilled from the source, with the honesty note.
    await expect(page.getByLabel("Title")).toHaveValue("Greek Salad");
    await expect(page.getByText(/nothing invented/i)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Ingredients 1" })).toHaveValue(/cucumber/);

    await page.getByRole("button", { name: "Save to shelf" }).click();

    // Saved — lands on the detail view and appears on the shelf.
    await expect(page.getByRole("heading", { name: "Greek Salad" })).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Greek Salad/i })).toBeVisible();
  });
});
