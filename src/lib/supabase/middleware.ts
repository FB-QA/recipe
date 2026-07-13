import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { stampVerifiedUser } from "@/lib/auth/session";

const PUBLIC_ROUTES = ["/login", "/signup", "/reset-password", "/auth", "/welcome", "/test-fixtures"];

/**
 * Refreshes the Supabase auth session on every request, enforces route protection,
 * and — the new part — STAMPS the verified user onto the request so nothing
 * downstream has to verify it again.
 *
 * This runs on every navigation (the matcher covers RSC payload requests too), and
 * `getUser()` is a network round-trip to Supabase's auth server, not a cookie read.
 * It is the single most expensive thing on the request path. Doing it here once, and
 * handing the result on, is why pages no longer pay for it a second time.
 * See `@/lib/auth/session`.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

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
    return NextResponse.redirect(url);
  }

  if (user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Hand the verified identity downstream. stampVerifiedUser() strips any inbound
  // copy first — a client can send these headers itself, and trusting them
  // unstripped would be an impersonation hole.
  //
  // Rebuilt from `request.headers` (not `response`) because the cookie refresh above
  // may have replaced `response`; the cookies it set are on the request already.
  const requestHeaders = stampVerifiedUser(request.headers, user);
  const forwarded = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.getAll().forEach((c) => forwarded.cookies.set(c));
  return forwarded;
}
