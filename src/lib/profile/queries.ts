import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

export type Profile = {
  displayName: string | null;
  email: string | null;
};

/**
 * The signed-in user's profile row. The shelf and the profile page both needed it
 * and each had its own inline `.from("profiles").select(...)` — this is the one
 * copy.
 *
 * `cache()` means a page can call it alongside its other queries in a `Promise.all`
 * without fear of fetching it twice: within one render pass the second caller gets
 * the first one's promise.
 */
export const getProfile = cache(async (): Promise<Profile> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .single();

  return {
    displayName: data?.display_name ?? null,
    // Fall back to the identity the proxy verified, so a missing profile row does
    // not cost us the user's name.
    email: data?.email ?? user.email,
  };
});

/** How many recipes this user has imported (rather than typed in by hand). */
export const countImports = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase.from("recipe_imports").select("id", { count: "exact", head: true });
  return count ?? 0;
});
