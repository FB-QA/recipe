import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test.describe("M3 — grocery lists", () => {
  test("add a recipe's ingredients onto its own list, add a manual item, check off, and clear completed", async ({
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

    // Open the drawer, keep all selected, add them.
    await page.getByRole("button", { name: "Add to grocery list" }).click();
    await expect(page.getByText("2 of 2 selected")).toBeVisible();
    await page.getByRole("button", { name: /Add 2 items/i }).click();
    await page.getByRole("button", { name: /view list/i }).click();
    await expect(page).toHaveURL(/\/list/);

    // Landed on the recipe's own list chip, named after it.
    await expect(page.getByRole("button", { name: /Salad/ })).toBeVisible();
    await expect(page.getByText("cucumber")).toBeVisible();
    await expect(page.getByText("feta")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Produce/i })).toBeVisible();

    // Add a manual item to this list.
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

  test("the drawer adds only the selected ingredients", async ({ page }) => {
    await signUp(page);
    await page.goto("/recipes/new");
    await page.getByLabel("Title").fill("Toast");
    await page.getByRole("textbox", { name: "Ingredients 1" }).fill("bread");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredients 2" }).fill("butter");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByRole("heading", { name: "Toast" })).toBeVisible();

    await page.getByRole("button", { name: "Add to grocery list" }).click();
    await page.getByRole("button", { name: /^butter$/i }).click(); // deselect
    await expect(page.getByText("1 of 2 selected")).toBeVisible();
    await page.getByRole("button", { name: /Add 1 item/i }).click();
    await page.getByRole("button", { name: /view list/i }).click();

    await expect(page.getByText("bread")).toBeVisible();
    await expect(page.getByText("butter")).toHaveCount(0);
  });

  test("adding the same recipe again reuses its list, never a duplicate", async ({ page }) => {
    await signUp(page);
    await page.goto("/recipes/new");
    await page.getByLabel("Title").fill("Curry");
    await page.getByRole("textbox", { name: "Ingredients 1" }).fill("onion");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByRole("heading", { name: "Curry" })).toBeVisible();
    const recipeUrl = page.url();

    await page.getByRole("button", { name: "Add to grocery list" }).click();
    await page.getByRole("button", { name: /Add 1 item/i }).click();
    await page.getByRole("button", { name: /view list/i }).click();
    await expect(page.getByRole("button", { name: /Curry/ })).toHaveCount(1);

    // Back to the recipe, add again → still one list, items appended.
    await page.goto(recipeUrl);
    await page.getByRole("button", { name: "Add to grocery list" }).click();
    await page.getByRole("button", { name: /Add 1 item/i }).click();
    await page.getByRole("button", { name: /view list/i }).click();

    await expect(page.getByRole("button", { name: /Curry/ })).toHaveCount(1);
    await expect(page.getByText("onion")).toHaveCount(2);
  });

  test("the All filter combines every list into one view", async ({ page }) => {
    await signUp(page);

    for (const [title, ingredient] of [
      ["Pasta", "spaghetti"],
      ["Soup", "stock cube"],
    ]) {
      await page.goto("/recipes/new");
      await page.getByLabel("Title").fill(title);
      await page.getByRole("textbox", { name: "Ingredients 1" }).fill(ingredient);
      await page.getByRole("button", { name: "Save recipe" }).click();
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      await page.getByRole("button", { name: "Add to grocery list" }).click();
      await page.getByRole("button", { name: /Add 1 item/i }).click();
      await page.getByRole("button", { name: /view list/i }).click();
    }

    // Default view is All → both recipes' items show together.
    await page.goto("/list");
    await expect(page.getByText("spaghetti")).toBeVisible();
    await expect(page.getByText("stock cube")).toBeVisible();

    // Selecting one list narrows to just its items.
    await page.getByRole("button", { name: /Pasta/ }).click();
    await expect(page.getByText("spaghetti")).toBeVisible();
    await expect(page.getByText("stock cube")).toHaveCount(0);
  });

  test("start a manual list from empty and add an item", async ({ page }) => {
    await signUp(page);
    await page.goto("/list");
    await page.getByRole("button", { name: "Start a list" }).click();
    await expect(page.getByRole("button", { name: /Shopping list/i })).toBeVisible();

    await page.getByLabel("Add an item").fill("milk");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page.getByText("milk")).toBeVisible();
  });
});
