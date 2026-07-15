import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUp, JSONLD_FIXTURE } from "./helpers";
import { adminClient, userClient } from "./db";
import { DAILY_IMPORT_LIMIT } from "../src/lib/import/limit";

/** Burn through the user's whole daily allowance in one bulk insert of their own rows. */
async function seedImportsAtCap(user: SupabaseClient, userId: string) {
  const rows = Array.from({ length: DAILY_IMPORT_LIMIT }, (_, n) => ({
    user_id: userId,
    source_url: `https://example.com/seeded-${userId}-${n}`,
    source_type: "website" as const,
    status: "success" as const,
  }));
  const { error } = await user.from("recipe_imports").insert(rows);
  if (error) throw error;
}

test.describe("import limit exemptions", () => {
  test("a user at the daily cap is blocked from importing", async ({ page }) => {
    const email = await signUp(page);
    const { client, userId } = await userClient(email);
    await seedImportsAtCap(client, userId);

    await page.goto("/import?source=web");
    await page.getByLabel("Recipe link").fill(JSONLD_FIXTURE);
    await page.getByRole("button", { name: "Get the recipe" }).click();

    await expect(page.getByText(/reached today's import limit/i)).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveCount(0);
  });

  test("an exempt user at the daily cap imports without restriction", async ({ page }) => {
    const email = await signUp(page);
    const { client, userId } = await userClient(email);
    await seedImportsAtCap(client, userId);

    // The operator grants the exemption — only the service role can write here.
    const { error } = await adminClient()
      .from("import_limit_exemptions")
      .insert({ user_id: userId, note: "e2e" });
    expect(error).toBeNull();

    await page.goto("/import?source=web");
    await page.getByLabel("Recipe link").fill(JSONLD_FIXTURE);
    await page.getByRole("button", { name: "Get the recipe" }).click();

    // Straight through to the editable review — no limit error.
    await expect(page.getByLabel("Title")).toHaveValue("Greek Salad");
    await expect(page.getByText(/reached today's import limit/i)).toHaveCount(0);
  });
});
