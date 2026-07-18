import { describe, expect, it } from "vitest";
import { attributionLabel, looksLikeHandle } from "./handle";

describe("attributionLabel — @ only for real handles", () => {
  it("prefixes an @ to a handle-shaped username", () => {
    expect(attributionLabel("emilyenglish")).toBe("@emilyenglish");
    expect(attributionLabel("em.the.nutritionist")).toBe("@em.the.nutritionist");
  });
  it("shows a display name (with spaces) plain — never @Display Name", () => {
    expect(attributionLabel("Emily English")).toBe("Emily English");
  });
  it("handles null/empty", () => {
    expect(attributionLabel(null)).toBeNull();
    expect(attributionLabel("   ")).toBeNull();
  });
  it("looksLikeHandle rejects spaces", () => {
    expect(looksLikeHandle("emilyenglish")).toBe(true);
    expect(looksLikeHandle("Emily English")).toBe(false);
  });
});
