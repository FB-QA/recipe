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

test.describe("M0 — the verified-user header cannot be forged", () => {
  // perf/nav-latency introduced a trust header: the proxy verifies the token ONCE
  // and stamps the user id onto the request, so pages no longer re-verify it (a
  // second network round-trip to Supabase on every single navigation).
  //
  // That is only safe because the proxy DELETES any inbound copy before setting its
  // own (`stampVerifiedUser`). If it ever stopped doing so, anyone could become
  // anyone by sending one header — the worst class of bug this codebase could have.
  // So it is tested, not asserted.

  test("a forged x-verified-user-id does not sign you in", async ({ page }) => {
    await page.setExtraHTTPHeaders({
      "x-verified-user-id": "00000000-0000-4000-8000-000000000000",
      "x-verified-user-email": "attacker%40example.com",
    });

    await page.goto("/");

    // Still bounced: the proxy gates on the real session cookie, and strips the
    // header before anything downstream can read it.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  });

  test("a signed-in user cannot become someone else by sending the header", async ({ page }) => {
    // The sharpest version of the test. The two above prove the signed-OUT gate
    // holds — but the gate is the session cookie, so they would still pass even if
    // the proxy forgot to strip the header. THIS one exercises the strip: sign in
    // properly, then forge a different identity and check the page still shows mine.
    const email = uniqueEmail();
    await page.goto("/signup");
    await page.getByLabel("Your name").fill("Romy");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("supersecret123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL("/");

    // Now, as a legitimately signed-in user, claim to be somebody else.
    await page.setExtraHTTPHeaders({
      "x-verified-user-id": "00000000-0000-4000-8000-000000000000",
      "x-verified-user-email": encodeURIComponent("attacker@example.com"),
    });
    await page.goto("/profile");

    // The proxy overwrote the forged stamp with the identity it actually verified.
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText("attacker@example.com")).toHaveCount(0);
  });

  test("a forged header cannot reach a protected page directly", async ({ request }) => {
    const res = await request.get("/profile", {
      headers: { "x-verified-user-id": "00000000-0000-4000-8000-000000000000" },
      maxRedirects: 0,
    });

    // A redirect to /login — never a 200 with somebody's profile on it.
    expect(res.status(), "a forged header must not render a protected page").toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    expect(res.headers()["location"]).toContain("/login");
  });
});
