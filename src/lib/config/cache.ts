/**
 * Client-side router cache — how long Next may reuse an already-fetched RSC payload
 * before going back to the server.
 *
 * Without this, `staleTimes.dynamic` defaults to 0: every navigation to a dynamic
 * page is a fresh server render, even flicking back to the page you left a second
 * ago. Every page here is dynamic (they read cookies for auth), so that default made
 * *every* navigation pay full price.
 *
 * `dynamic` is deliberately short. These pages show the user's own data, and they
 * mutate it constantly (favouriting, ticking off groceries). Half a minute is long
 * enough to make back-and-forth navigation instant, short enough that a change made
 * on another device does not linger. Server Actions revalidate their own paths, so a
 * mutation you make yourself is reflected immediately regardless.
 */
export const ROUTER_CACHE_SECONDS = {
  dynamic: 30,
  static: 180,
} as const;
