import { describe, expect, it } from "vitest";
import { pastedTextResolver } from "./pasted-text";
import type { ImportRequest } from "../schema";

const req = (text: string | null): ImportRequest => ({
  sourceKind: "pasted_text",
  url: null,
  text,
  userId: "u1",
  importId: "imp1",
});

describe("pastedTextResolver", () => {
  it("wraps normalised text as complete evidence", async () => {
    const r = await pastedTextResolver.resolve(req("Ingredients:\n\n\n500g flour\r\n2 eggs   \nMethod: mix"), {
      previousEvidence: [],
    });
    expect(r.evidence.retrievalStatus).toBe("complete");
    expect(r.evidence.caption).toContain("500g flour");
    expect(r.evidence.caption).not.toMatch(/\n{3,}/);
    expect(r.evidence.contentFingerprint).toHaveLength(32);
    expect(r.failure).toBeNull();
  });

  it("reports invalid_input for empty text", async () => {
    const r = await pastedTextResolver.resolve(req("   "), { previousEvidence: [] });
    expect(r.evidence.retrievalStatus).toBe("unavailable");
    expect(r.failure).toBe("invalid_input");
  });

  it("supports only its own source kind with content", () => {
    expect(pastedTextResolver.supports(req("hello"))).toBe(true);
    expect(pastedTextResolver.supports(req(""))).toBe(false);
    expect(pastedTextResolver.supports({ ...req("x"), sourceKind: "website" })).toBe(false);
  });
});
