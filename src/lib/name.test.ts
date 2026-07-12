import { describe, it, expect } from "vitest";
import { firstName } from "@/lib/name";

describe("firstName", () => {
  it("returns the first token of a full name", () => {
    expect(firstName("Romy Byrne")).toBe("Romy");
  });

  it("returns a single name unchanged", () => {
    expect(firstName("Romy")).toBe("Romy");
  });

  it("trims surrounding whitespace", () => {
    expect(firstName("  Romy  ")).toBe("Romy");
  });

  it("falls back to a neutral word when empty or missing", () => {
    expect(firstName("")).toBe("My");
    expect(firstName("   ")).toBe("My");
    expect(firstName(null)).toBe("My");
    expect(firstName(undefined)).toBe("My");
  });
});
