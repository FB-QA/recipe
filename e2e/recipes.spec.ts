import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test.describe("M1 — recipes core", () => {
  test("create, view, favourite, edit, and delete a recipe", async ({ page }) => {
    await signUp(page);

    // Empty shelf → add manually
    await page.getByRole("link", { name: /add your first recipe/i }).click();
    await expect(page).toHaveURL("/add");
    await page.getByRole("link", { name: /create manually/i }).click();
    await expect(page).toHaveURL("/recipes/new");

    // Fill the form
    await page.getByLabel("Title").fill("Greek Chicken Burgers");
    await page.getByPlaceholder("2 chicken breasts").fill("2 chicken breasts");
    await page.getByPlaceholder(/Describe this step/).fill("Griddle the chicken until charred.");
    await page.getByRole("button", { name: "Save recipe" }).click();

    // Lands on the detail view
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "Greek Chicken Burgers" })).toBeVisible();
    await expect(page.getByText("2 chicken breasts")).toBeVisible();

    // Favourite it
    await page.getByRole("button", { name: /add to favourites/i }).click();
    await expect(page.getByRole("button", { name: /remove from favourites/i })).toBeVisible();

    // Shows on the home shelf and under the Favourites filter
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Greek Chicken Burgers/i })).toBeVisible();
    await page.getByRole("link", { name: "Favourites" }).click();
    await expect(page.getByRole("link", { name: /Greek Chicken Burgers/i })).toBeVisible();

    // Edit the title
    await page.getByRole("link", { name: /Greek Chicken Burgers/i }).click();
    await page.getByRole("link", { name: "Edit recipe" }).click();
    await expect(page).toHaveURL(/\/edit$/);
    await page.getByLabel("Title").fill("Greek Chicken Burgers v2");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: "Greek Chicken Burgers v2" })).toBeVisible();

    // Delete it (two-tap)
    await page.getByRole("button", { name: "Delete recipe" }).click();
    await page.getByRole("button", { name: "Tap again to delete" }).click();
    await expect(page).toHaveURL("/recipes");
    await expect(page.getByRole("heading", { name: "No recipes yet" })).toBeVisible();
  });

  test("scaling portions updates the ingredient amounts", async ({ page }) => {
    await signUp(page);
    await page.goto("/recipes/new");
    await page.getByLabel("Title").fill("Roast");
    await page.getByLabel("Serves").fill("2");
    await page.getByRole("textbox", { name: "Ingredients 1" }).fill("2 chicken breasts");
    await page.getByRole("button", { name: "Save recipe" }).click();

    await expect(page.getByRole("heading", { name: "Roast" })).toBeVisible();
    await expect(page.getByText("2 chicken breasts")).toBeVisible();

    // 2 → 3 portions (×1.5): "2 chicken breasts" becomes 3.
    await page.getByRole("button", { name: "More portions" }).click();
    await expect(page.getByText("3 portions")).toBeVisible();
    await expect(page.getByText("3 chicken breasts")).toBeVisible();
    await expect(page.getByText("2 chicken breasts")).toHaveCount(0);

    await page.getByRole("button", { name: "Fewer portions" }).click();
    await expect(page.getByText("2 chicken breasts")).toBeVisible();
  });

  test("search finds a recipe by title and reports no matches otherwise", async ({ page }) => {
    await signUp(page);
    await page.goto("/recipes/new");
    await page.getByLabel("Title").fill("Strawberry Chia Pudding");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByRole("heading", { name: "Strawberry Chia Pudding" })).toBeVisible();

    await page.goto("/recipes");
    await page.getByRole("searchbox", { name: /search recipes/i }).fill("chia");
    await expect(page.getByRole("link", { name: /Strawberry Chia Pudding/i })).toBeVisible();

    await page.getByRole("searchbox", { name: /search recipes/i }).fill("pizza");
    await expect(page.getByText(/nothing matches/i)).toBeVisible();
  });
});
