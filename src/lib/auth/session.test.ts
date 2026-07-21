import { beforeEach, describe, expect, it, vi } from "vitest";

// `cache()` is request-scoped in React; a unit test has no request, so make it a
// pass-through and exercise the resolver call-by-call.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

let headersMock: Headers;
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => headersMock),
}));

// A spy on the ONE network verification point. The whole handoff fix rests on this
// never being reached from a protected Server Component render.
const getUserSpy = vi.fn(async () => ({
  data: { user: null as null | { id: string; email: string | null } },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: getUserSpy } })),
}));

import { currentUser, requireUser, stampVerifiedUser, AUTH_HEADER } from "./session";

beforeEach(() => {
  vi.clearAllMocks();
  headersMock = new Headers();
  getUserSpy.mockResolvedValue({ data: { user: null } });
});

describe("currentUser — the proxy stamp is the only identity source in a protected render", () => {
  it("resolves from the stamp with no network call when present", async () => {
    headersMock = new Headers({
      [AUTH_HEADER.id]: "u1",
      [AUTH_HEADER.email]: encodeURIComponent("f@x.com"),
    });
    await expect(currentUser()).resolves.toEqual({ id: "u1", email: "f@x.com" });
    expect(getUserSpy).not.toHaveBeenCalled();
  });

  // THE PROOF. A Server Component cannot persist a rotated cookie (server.ts's
  // setAll is a no-op there), so a getUser() here refreshes a token that is then
  // lost — replayed later as a stale token and revoked as suspected reuse
  // ("Session not found"). It must never happen: absent stamp → fail closed.
  it("does NOT refresh when the stamp is absent — no getUser, returns null", async () => {
    headersMock = new Headers(); // no stamp
    await expect(currentUser()).resolves.toBeNull();
    expect(getUserSpy).not.toHaveBeenCalled();
  });
});

describe("requireUser — fails closed and loud, never renders an empty shelf", () => {
  it("throws when the stamp is absent, without a network round-trip", async () => {
    headersMock = new Headers();
    await expect(requireUser()).rejects.toThrow(/proxy/i);
    expect(getUserSpy).not.toHaveBeenCalled();
  });

  it("returns the stamped user when present", async () => {
    headersMock = new Headers({ [AUTH_HEADER.id]: "u1" });
    await expect(requireUser()).resolves.toEqual({ id: "u1", email: null });
  });
});

describe("stampVerifiedUser — strips inbound spoofs before stamping", () => {
  it("deletes any client-sent identity header, then sets the verified one", () => {
    const inbound = new Headers({ [AUTH_HEADER.id]: "attacker", "x-other": "keep" });
    const out = stampVerifiedUser(inbound, { id: "real", email: "r@x.com" });
    expect(out.get(AUTH_HEADER.id)).toBe("real");
    expect(out.get(AUTH_HEADER.email)).toBe(encodeURIComponent("r@x.com"));
    expect(out.get("x-other")).toBe("keep");
  });

  it("clears identity headers entirely when there is no user", () => {
    const inbound = new Headers({ [AUTH_HEADER.id]: "attacker" });
    const out = stampVerifiedUser(inbound, null);
    expect(out.get(AUTH_HEADER.id)).toBeNull();
  });
});
