import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { stampVerifiedUser } from "@/lib/auth/session";

const PUBLIC_ROUTES = ["/login", "/signup", "/reset-password", "/auth", "/welcome", "/test-fixtures"];

/**
 * Refreshes the Supabase auth session on every request, enforces route protection,
 * and STAMPS the verified user onto the request so nothing downstream has to verify
 * it again. This is the SOLE session-refresh authority in the app — see
 * `@/lib/auth/session`.
 *
 * This runs on every navigation (the matcher covers RSC payload requests too), and
 * `getUser()` is a network round-trip to Supabase's auth server, not a cookie read.
 * It is the single most expensive thing on the request path. Doing it here once, and
 * handing the result on, is why pages no longer pay for it a second time.
 *
 * THE HANDOFF INVARIANT. When getUser() rotates the token, the new cookies must reach
 * BOTH ends or the session tears: the browser (so it stops replaying the old refresh
 * token, which the auth server revokes as suspected reuse — "Session not found") AND
 * the downstream render (so the page's Supabase client sends the fresh token to
 * PostgREST, not a superseded one that 401s). We collect the rotated cookies once and
 * apply them to whichever response we return.
 */
export async function updateSession(request: NextRequest) {
  const rotatedCookies: Array<{ name: string; value: string; options: CookieOptions }> = [];

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Update the request view so a Server Component reading request.cookies
          // this same render gets the refreshed token, and remember the set so we can
          // flush it to the browser response below.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          rotatedCookies.push(...cookiesToSet);
        },
      },
    },
  );

  // Apply every rotated cookie to the outgoing response. Called on every return path
  // — forward AND both redirects — so a refresh is never dropped on the floor.
  const flush = (response: NextResponse) => {
    rotatedCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    return response;
  };

  // IMPORTANT: getUser() revalidates the token with the auth server — do not
  // trust getSession() alone for auth decisions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_ROUTES.some((r) => path === r || path.startsWith(r + "/"));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return flush(NextResponse.redirect(url));
  }

  if (user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return flush(NextResponse.redirect(url));
  }

  // Hand the verified identity downstream. stampVerifiedUser() strips any inbound
  // copy first — a client can send these headers itself, and trusting them unstripped
  // would be an impersonation hole. `request.headers` already reflects the rotated
  // cookies (request.cookies.set above updated the Cookie header), so the forwarded
  // request carries the fresh token AND the verified id.
  const requestHeaders = stampVerifiedUser(request.headers, user);
  return flush(NextResponse.next({ request: { headers: requestHeaders } }));
}
