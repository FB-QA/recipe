import { describe, expect, it } from "vitest";
import { importConfig, isCompositeReelCover } from "./config";

describe("isCompositeReelCover", () => {
  it("detects Instagram's play-button composite transform", () => {
    expect(isCompositeReelCover("https://cdn/x.jpg?stp=cmp1_dst-jpg_e35_s640x640")).toBe(true);
  });
  it("passes a clean displayUrl (no composite)", () => {
    expect(isCompositeReelCover("https://cdn/x.jpg?stp=dst-jpg_e15_tt6")).toBe(false);
    expect(isCompositeReelCover("https://cdn/x.jpg")).toBe(false);
    expect(isCompositeReelCover(null)).toBe(false);
  });
});

describe("importConfig", () => {
  it("defaults to anthropic/haiku and reel-cover enrichment on", () => {
    const c = importConfig({} as NodeJS.ProcessEnv);
    expect(c.primaryProvider).toBe("anthropic");
    expect(c.primaryModel).toBe("claude-haiku-4-5");
    expect(c.reelCoverEnrich).toBe(true);
  });
  it("honours IMPORT_REEL_COVER_ENRICH=false", () => {
    expect(importConfig({ IMPORT_REEL_COVER_ENRICH: "false" } as unknown as NodeJS.ProcessEnv).reelCoverEnrich).toBe(false);
  });
});
