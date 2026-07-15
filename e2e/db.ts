import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TEST_PASSWORD } from "./helpers";

/**
 * Direct database seams for E2E setup — the journeys drive the UI, but
 * arranging state (seeding rows, granting exemptions) goes straight to the
 * local Supabase stack.
 *
 * The fallback keys are the stack's well-known demo credentials — identical
 * on every machine that runs `supabase start`, never a production secret.
 */
const LOCAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const LOCAL_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const LOCAL_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/** Service-role client — the operator's seat. Only for state no client role may write. */
export function adminClient(): SupabaseClient {
  return createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/** Sign a UI-created test user in from Node, for seeding their own rows under RLS. */
export async function userClient(
  email: string,
): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (error) throw error;
  return { client, userId: data.user.id };
}
