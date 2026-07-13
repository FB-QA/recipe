import { test, expect } from "@playwright/test";

function uniqueEmail() {
  return `romy_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
}

test.describe("M0 — auth & app shell", () => {
  test("sign up lands on the private empty shelf; sign out returns to login", async ({ page }) => {
    const email = uniqueEmail();

    await page.goto("/signup");
    await page.getByLabel("Your name").fill("Romy");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("supersecret123");
    await page.getByRole("button", { name: "Create account" }).click();

    // Auto-confirmed locally → dropped straight onto the personalised shelf.
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Romy's recipes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your shelf is empty" })).toBeVisible();

    // Identity shows on Profile; sign out returns to login.
    await page.getByRole("link", { name: "Profile" }).click();
    await expect(page).toHaveURL("/profile");
    await expect(page.getByText(email)).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("visiting a protected route while signed out redirects to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  });

  test("bad credentials show an error and stay on login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText(/don't match/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
