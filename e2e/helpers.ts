import { type Page, expect } from "@playwright/test";

/** Every UI-created test account uses this password, so db.ts can sign back in. */
export const TEST_PASSWORD = "supersecret123";

/** The deterministic JSON-LD import fixture, served by the app under test. */
export const JSONLD_FIXTURE = "http://localhost:3100/test-fixtures/greek-salad.html";

export function uniqueEmail() {
  return `romy_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Sign up a fresh user and land on the home shelf. Returns the email used. */
export async function signUp(page: Page, name = "Romy") {
  const email = uniqueEmail();
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");
  return email;
}
