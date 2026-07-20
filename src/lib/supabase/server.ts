import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server-side Supabase client for Server Components, Route Handlers, and
 * Server Actions. Reads/writes the auth session from Next's cookie store.
 * Still bound by RLS — the service role key is never used here.
 *
 * `cache()` makes this ONE client per request, shared across every query in that
 * render. That is load-bearing, not just an allocation saving: a page fans several
 * queries out in a `Promise.all`, and if each held its own client, a token sitting
 * near expiry would have them all try to refresh it at once. With refresh-token
 * rotation on, the first refresh wins and rotates the token out from under the
 * others, which then 401 — so one query in the fan-out succeeds and another comes
 * back empty on the very same render (a populated header over an empty shelf). A
 * single shared client serialises that refresh through supabase-js's own lock, so
 * the whole render sees one consistent session.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — cookies are read-only here.
            // Session refresh is handled by middleware, so this is safe to ignore.
          }
        },
      },
    },
  );
});

/**
 * The RLS-bound server client's type, for helpers that receive one as a
 * parameter. Import with `import type` so pure modules stay free of this
 * file's runtime dependencies (next/headers).
 */
export type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Service-role client — bypasses RLS. SERVER-ONLY, never expose to the client.
 * Use sparingly: storage cleanup, admin tasks, trusted server jobs.
 */
export function createServiceClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
    },
  );
}
