import { beforeEach, describe, expect, it, vi } from "vitest";

// A shared log so we can assert that revalidation happens BEFORE the redirect —
// the whole point of the fix is that the router cache is invalidated before the
// client navigates to the (now authenticated) shelf.
const order: string[] = [];

const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn((...args: unknown[]) => {
    order.push(`revalidate:${JSON.stringify(args)}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    order.push(`redirect:${path}`);
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Map([["origin", "http://localhost:3000"]])),
}));

import { signIn, signUp, updatePassword } from "./actions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  order.length = 0;
  vi.clearAllMocks();
});

describe("signIn — invalidates the router cache before redirecting", () => {
  it("revalidates the whole app tree, then redirects to next", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });

    await signIn(undefined, form({ email: "a@b.com", password: "password1", next: "/" }));

    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(redirect).toHaveBeenCalledWith("/");
    // Order matters: a redirect that lands before the cache is cleared serves the
    // signed-out shelf — the exact bug this test guards.
    expect(order).toEqual([`revalidate:${JSON.stringify(["/", "layout"])}`, "redirect:/"]);
  });

  it("does NOT revalidate or redirect when the credentials are wrong", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: "bad" } });

    const result = await signIn(undefined, form({ email: "a@b.com", password: "password1", next: "/" }));

    expect(result).toEqual({ error: expect.stringContaining("don't match") });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("signUp — invalidates the router cache before redirecting on an immediate session", () => {
  it("revalidates then redirects when a session exists (local auto-confirm)", async () => {
    auth.signUp.mockResolvedValue({ data: { session: { user: {} } }, error: null });

    await signUp(undefined, form({ email: "a@b.com", password: "password1", displayName: "Tara" }));

    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(redirect).toHaveBeenCalledWith("/");
    expect(order).toEqual([`revalidate:${JSON.stringify(["/", "layout"])}`, "redirect:/"]);
  });

  it("neither revalidates nor redirects when email confirmation is pending", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });

    const result = await signUp(undefined, form({ email: "a@b.com", password: "password1", displayName: "Tara" }));

    expect(result).toEqual({ message: expect.stringContaining("confirm") });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("updatePassword — invalidates the router cache before redirecting", () => {
  it("revalidates then redirects home", async () => {
    auth.updateUser.mockResolvedValue({ error: null });

    await updatePassword(undefined, form({ password: "password1" }));

    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(redirect).toHaveBeenCalledWith("/");
    expect(order).toEqual([`revalidate:${JSON.stringify(["/", "layout"])}`, "redirect:/"]);
  });
});
