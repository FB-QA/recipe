import { describe, it, expect } from "vitest";
import { safeRelativePath } from "@/lib/safe-path";

describe("safeRelativePath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeRelativePath("/recipes/123")).toBe("/recipes/123");
    expect(safeRelativePath("/")).toBe("/");
    expect(safeRelativePath("/list?list=abc")).toBe("/list?list=abc");
  });

  it("rejects open-redirect attempts and non-paths", () => {
    expect(safeRelativePath("https://attacker.example")).toBe("/");
    expect(safeRelativePath("//attacker.example")).toBe("/");
    expect(safeRelativePath("/\\attacker.example")).toBe("/");
    expect(safeRelativePath("javascript:alert(1)")).toBe("/");
    expect(safeRelativePath("")).toBe("/");
    expect(safeRelativePath(null)).toBe("/");
    expect(safeRelativePath(42)).toBe("/");
  });
});
