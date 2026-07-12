import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test.describe("M1 — cover image upload", () => {
  test("uploads and stores an optimised cover, served via a signed URL", async ({ page }) => {
    await signUp(page);
    await page.goto("/recipes/new");
    await page.getByLabel("Title").fill("Photo Recipe");
    await page.setInputFiles('input[type="file"][name="cover"]', "e2e/fixtures/test-cover.jpg");
    await page.getByRole("button", { name: "Save recipe" }).click();

    await expect(page.getByRole("heading", { name: "Photo Recipe" })).toBeVisible();

    // The detail hero renders the stored image via a signed storage URL.
    const cover = page.locator('img[alt=""]').first();
    await expect(cover).toHaveAttribute("src", /recipe-images.*token=/);
  });
});
