import { afterEach, describe, expect, it, vi } from "vitest";
import { isAdmin } from "./admin";

const withAdminEmail = (email: string | undefined, fn: () => void) => {
  const prev = process.env.ADMIN_EMAIL;
  if (email === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = email;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = prev;
  }
};

afterEach(() => vi.restoreAllMocks());

describe("isAdmin — sole-operator gate (AC4)", () => {
  it("matches the configured admin email, case-insensitive", () => {
    withAdminEmail("freddi@cookdex.test", () => {
      expect(isAdmin({ id: "1", email: "Freddi@Cookdex.test" })).toBe(true);
      expect(isAdmin({ id: "2", email: "someone@else.com" })).toBe(false);
    });
  });

  it("denies everyone when ADMIN_EMAIL is unset (never 'everyone')", () => {
    withAdminEmail(undefined, () => {
      expect(isAdmin({ id: "1", email: "freddi@cookdex.test" })).toBe(false);
    });
  });

  it("denies a signed-out user", () => {
    withAdminEmail("freddi@cookdex.test", () => {
      expect(isAdmin(null)).toBe(false);
      expect(isAdmin({ id: "1", email: null })).toBe(false);
    });
  });
});
