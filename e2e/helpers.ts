import { type Page, expect } from "@playwright/test";

export function uniqueEmail() {
  return `romy_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Sign up a fresh user and land on the home shelf. Returns the email used. */
export async function signUp(page: Page, name = "Romy") {
  const email = uniqueEmail();
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("supersecret123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");
  return email;
}
