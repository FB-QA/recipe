import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test.describe("M3 — grocery lists", () => {
  test("add a recipe's ingredients, add a manual item, check off, and clear completed", async ({
    page,
  }) => {
    await signUp(page);

    // A recipe with two ingredients.
    await page.goto("/recipes/new");
    await page.getByLabel("Title").fill("Salad");
    await page.getByRole("textbox", { name: "Ingredients 1" }).fill("cucumber");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredients 2" }).fill("feta");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByRole("heading", { name: "Salad" })).toBeVisible();

    // Add all ingredients to a list.
    await page.getByRole("button", { name: /add all to grocery list/i }).click();
    await page.getByRole("button", { name: /view list/i }).click();
    await expect(page).toHaveURL(/\/list/);
    await expect(page.getByText("cucumber")).toBeVisible();
    await expect(page.getByText("feta")).toBeVisible();

    // Add a manual item.
    await page.getByLabel("Add an item").fill("olive oil");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page.getByText("olive oil")).toBeVisible();

    // Check one off → it moves to Completed.
    await page.getByRole("button", { name: "Mark as bought" }).first().click();
    await expect(page.getByText(/Completed · 1/)).toBeVisible();

    // Clear completed.
    await page.getByRole("button", { name: "Clear completed" }).click();
    await expect(page.getByText(/Completed ·/)).toBeHidden();
  });

  test("start a list from empty and add an item", async ({ page }) => {
    await signUp(page);
    await page.goto("/list");
    await page.getByRole("button", { name: "Start a list" }).click();
    await expect(page.getByRole("link", { name: "This Week" })).toBeVisible();

    await page.getByLabel("Add an item").fill("milk");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page.getByText("milk")).toBeVisible();
  });
});
