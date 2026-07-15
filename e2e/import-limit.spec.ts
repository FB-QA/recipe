import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { signUp } from "./helpers";

// Same deterministic JSON-LD fixture the website-import journey uses.
const FIXTURE = "http://localhost:3100/test-fixtures/greek-salad.html";

// The local Supabase stack's well-known demo credentials — identical on every
// machine that runs `supabase start`, never a production secret.
const LOCAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const LOCAL_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const LOCAL_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

function adminClient(): SupabaseClient {
  return createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/** Sign the test user in from Node — clients only hold grants for their own rows. */
async function userClient(email: string): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: "supersecret123",
  });
  if (error) throw error;
  return { client, userId: data.user.id };
}

/** Burn through the user's whole daily allowance in one bulk insert of their own rows. */
async function seedImportsAtCap(user: SupabaseClient, userId: string) {
  const rows = Array.from({ length: 25 }, (_, n) => ({
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
    await page.getByLabel("Recipe link").fill(FIXTURE);
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
    await page.getByLabel("Recipe link").fill(FIXTURE);
    await page.getByRole("button", { name: "Get the recipe" }).click();

    // Straight through to the editable review — no limit error.
    await expect(page.getByLabel("Title")).toHaveValue("Greek Salad");
    await expect(page.getByText(/reached today's import limit/i)).toHaveCount(0);
  });
});
