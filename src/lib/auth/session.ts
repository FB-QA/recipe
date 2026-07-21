import { cache } from "react";
import { headers } from "next/headers";

/**
 * The one place the signed-in user is resolved. Every page, action and query
 * asks here — nothing calls `supabase.auth.getUser()` directly any more.
 *
 * WHY THIS EXISTS. `getUser()` is not a cookie read: it round-trips to Supabase's
 * auth server to revalidate the token. `proxy.ts` already does that on every
 * request, and then every page did it AGAIN — a second full network round-trip,
 * serially, before a single row was fetched. Measured at ~70ms each, on every
 * navigation, paid twice.
 *
 * So the proxy — which has already verified the token — stamps the result onto
 * the request, and everything downstream reads it for free. One verification per
 * request, at the edge, where it belongs.
 *
 * The proxy is also the SOLE session-refresh authority. A Server Component cannot
 * persist a rotated cookie (server.ts's `setAll` is a no-op in that context), so a
 * `getUser()` here would refresh a token it then loses — replayed on the next
 * request as a stale token and revoked by the auth server as suspected reuse
 * ("Session not found"), logging the user out on their first post-login render.
 * Hence: no fallback verification. Absent stamp on a protected render is a bug to
 * surface, never a reason to refresh.
 */

/**
 * Headers the proxy stamps AFTER verifying the token. Never trust these from a
 * client: `stampVerifiedUser()` deletes any inbound copy before setting its own.
 */
export const AUTH_HEADER = {
  id: "x-verified-user-id",
  email: "x-verified-user-email",
} as const;

/**
 * The message shown when an action is reached without a session. It was written out
 * four times across the actions; this is the one copy.
 */
export const SIGNED_OUT_ERROR = "You've been signed out — log in and try again.";

export type VerifiedUser = {
  id: string;
  email: string | null;
};

/**
 * Called by the proxy once the token is verified. Returns headers safe to forward.
 *
 * The delete is the load-bearing line: a client can send `x-verified-user-id`
 * itself, and without stripping it first we would hand it a way to become anyone.
 * We overwrite unconditionally — signed in or not.
 */
export function stampVerifiedUser(
  requestHeaders: Headers,
  user: { id: string; email?: string | null } | null,
): Headers {
  const stamped = new Headers(requestHeaders);
  stamped.delete(AUTH_HEADER.id);
  stamped.delete(AUTH_HEADER.email);

  if (user) {
    stamped.set(AUTH_HEADER.id, user.id);
    // Header values are latin-1; encode so a non-ASCII address cannot throw.
    if (user.email) stamped.set(AUTH_HEADER.email, encodeURIComponent(user.email));
  }
  return stamped;
}

/**
 * The signed-in user for THIS request, or null.
 *
 * `cache()` dedupes it across a single render pass, so a page and the queries it
 * calls all share one resolution. It reads the proxy's stamp and makes no network
 * call — ever. No stamp means no verified session was handed down: return null and
 * let the caller fail closed (`requireUser` throws; actions return the signed-out
 * error). It deliberately does NOT verify-by-refresh here — see the header comment.
 */
export const currentUser = cache(async (): Promise<VerifiedUser | null> => {
  const h = await headers();
  const id = h.get(AUTH_HEADER.id);
  if (!id) return null;

  const email = h.get(AUTH_HEADER.email);
  return { id, email: email ? decodeURIComponent(email) : null };
});

/**
 * The signed-in user, or throw. For code that only runs behind the proxy's auth
 * gate and therefore cannot legitimately be reached signed-out — a null there is a
 * bug, not a user state, and should be loud rather than a silent `user!`.
 */
export async function requireUser(): Promise<VerifiedUser> {
  const user = await currentUser();
  if (!user) throw new Error("requireUser(): no signed-in user — the proxy should have redirected");
  return user;
}
