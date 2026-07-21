import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Capture the cookie adapter the middleware hands to supabase-js, so the test can
// drive a refresh through it — exactly what getUser() does when the token is stale.
let cookieAdapter: { getAll: () => unknown[]; setAll: (c: Array<{ name: string; value: string; options?: unknown }>) => void };
let refreshOnGetUser: Array<{ name: string; value: string; options?: Record<string, unknown> }> | null;
let userResult: { id: string; email: string | null } | null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url: string, _key: string, opts: { cookies: typeof cookieAdapter }) => {
    cookieAdapter = opts.cookies;
    return {
      auth: {
        getUser: vi.fn(async () => {
          if (refreshOnGetUser) cookieAdapter.setAll(refreshOnGetUser);
          return { data: { user: userResult } };
        }),
      },
    };
  }),
}));

import { updateSession } from "./middleware";

function req(path: string, cookies: Record<string, string> = {}) {
  const r = new NextRequest(`https://app.test${path}`);
  for (const [k, v] of Object.entries(cookies)) r.cookies.set(k, v);
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  refreshOnGetUser = null;
  userResult = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});

describe("updateSession — a mid-request refresh reaches BOTH the render and the browser", () => {
  it("forwards the refreshed cookie downstream (Server Component) AND onto the response (browser)", async () => {
    userResult = { id: "u1", email: "f@x.com" };
    refreshOnGetUser = [{ name: "sb-access", value: "NEW", options: { path: "/" } }];
    const request = req("/", { "sb-access": "OLD" });

    const res = await updateSession(request);

    // Downstream: the page's Supabase client reads request.cookies — it must see NEW,
    // or it sends the superseded token to PostgREST and earns a 401.
    expect(request.cookies.get("sb-access")?.value).toBe("NEW");
    // Browser: Set-Cookie carries NEW so the next request stops replaying OLD (which
    // is what the auth server revokes as suspected reuse).
    expect(res.cookies.get("sb-access")?.value).toBe("NEW");
  });

  it("stamps the verified id onto the forwarded request and ignores an inbound spoof", async () => {
    userResult = { id: "real", email: null };
    const request = req("/");
    request.headers.set("x-verified-user-id", "attacker");
    const res = await updateSession(request);
    expect(res.headers.get("x-middleware-request-x-verified-user-id")).toBe("real");
  });

  it("does not stamp an identity when there is no user", async () => {
    userResult = null;
    const res = await updateSession(req("/login"));
    expect(res.headers.get("x-middleware-request-x-verified-user-id")).toBeNull();
  });
});

describe("updateSession — route protection", () => {
  it("redirects an unauthenticated protected request to /login and still flushes refreshed cookies", async () => {
    userResult = null;
    refreshOnGetUser = [{ name: "sb-access", value: "CLEARED", options: {} }];
    const res = await updateSession(req("/plan", { "sb-access": "OLD" }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
    expect(res.headers.get("location")).toContain("next=%2Fplan");
    expect(res.cookies.get("sb-access")?.value).toBe("CLEARED");
  });

  it("lets an unauthenticated public route through", async () => {
    userResult = null;
    const res = await updateSession(req("/login"));
    expect(res.status).not.toBe(307);
  });

  it("bounces a signed-in user away from /login", async () => {
    userResult = { id: "u1", email: null };
    const res = await updateSession(req("/login"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/app\.test\/?$/);
  });
});
