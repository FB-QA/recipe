import { test, expect } from "@playwright/test";
import { signUp, TEST_PASSWORD } from "./helpers";

// Regression guard for the post-login handoff race. The bug: the first render after
// sign-in ran a data query with a superseded token (401) / a session the auth server
// had revoked (403 "Session not found"), so the shelf fell to the "That didn't go to
// plan" error boundary and only a manual reload recovered. The fix makes the proxy
// the sole refresh authority and never refreshes from a Server Component; this test
// asserts the user-visible contract: every cold sign-in renders the shelf, first try.
//
// NOTE ON LATENCY: the production race widened under real server↔auth-server latency,
// which Playwright cannot inject (those calls are server-to-server, not in the
// browser). The definitive mechanism proof lives in the unit tests
// (session.test.ts / middleware.test.ts). This guards the deterministic symptom.
test.describe("auth handoff — every cold sign-in renders the shelf, never the error boundary", () => {
  test("repeated cold sign-ins land on the rendered shelf without a manual reload", async ({ page }) => {
    const email = await signUp(page); // creates the account and lands on the shelf once

    for (let i = 0; i < 4; i++) {
      await page.getByRole("link", { name: "Profile" }).click();
      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page).toHaveURL(/\/login/);

      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(TEST_PASSWORD);
      await page.getByRole("button", { name: "Log in" }).click();

      // First render after login must be the shelf itself, not the error boundary,
      // and without any reload.
      await expect(page).toHaveURL("/");
      await expect(page.getByRole("heading", { name: "Romy's recipes" })).toBeVisible();
      await expect(page.getByText("That didn't go to plan")).toHaveCount(0);
    }
  });
});
