import { beforeEach, describe, expect, it, vi } from "vitest";

// Same principle as recipes/queries: a transient query error must surface (throw),
// never silently degrade — getProfile runs in the very shelf Promise.all this PR
// fixes, and countImports renders as "0 · free tier" if a failure reads as zero.

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: "u1", email: "freddi@example.com" })),
}));

let profileResult: { data: unknown; error: unknown };
let countResult: { count: number | null; error: unknown };

function makeClient() {
  const builder: Record<string, unknown> = {};
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => Promise.resolve(profileResult));
  return {
    from: vi.fn(() => ({
      select: vi.fn((_cols: string, opts?: { head?: boolean }) => {
        if (opts?.head) return Promise.resolve(countResult);
        return builder;
      }),
    })),
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => makeClient()) }));

import { getProfile, countImports } from "./queries";

beforeEach(() => {
  vi.clearAllMocks();
  profileResult = { data: null, error: null };
  countResult = { count: 0, error: null };
});

describe("getProfile — throws on a real error, falls back on a genuinely-missing row", () => {
  it("throws when the query errors (never a silently degraded profile)", async () => {
    profileResult = { data: null, error: { message: "JWT expired" } };
    await expect(getProfile()).rejects.toThrow(/getProfile/i);
  });

  it("falls back to the verified identity when the row isn't there yet (no error)", async () => {
    profileResult = { data: null, error: null };
    await expect(getProfile()).resolves.toEqual({ displayName: null, email: "freddi@example.com" });
  });

  it("returns the profile on success", async () => {
    profileResult = { data: { display_name: "Freddi", email: "f@x.com" }, error: null };
    await expect(getProfile()).resolves.toEqual({ displayName: "Freddi", email: "f@x.com" });
  });
});

describe("countImports — throws on a real error, never silently reports zero", () => {
  it("throws when the count query errors", async () => {
    countResult = { count: null, error: { message: "JWT expired" } };
    await expect(countImports()).rejects.toThrow(/countImports/i);
  });

  it("returns the count on success", async () => {
    countResult = { count: 3, error: null };
    await expect(countImports()).resolves.toBe(3);
  });
});
