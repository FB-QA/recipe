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
  it("defaults the primary model to a Gemini model when the provider is google", () => {
    // Switching provider alone must not feed an Anthropic model id into Gemini.
    const c = importConfig({ AI_PRIMARY_PROVIDER: "google" } as unknown as NodeJS.ProcessEnv);
    expect(c.primaryModel).toBe("gemini-3.1-flash-lite");
  });
  it("still honours an explicit AI_PRIMARY_MODEL under google", () => {
    const c = importConfig({
      AI_PRIMARY_PROVIDER: "google",
      AI_PRIMARY_MODEL: "gemini-2.5-flash",
    } as unknown as NodeJS.ProcessEnv);
    expect(c.primaryModel).toBe("gemini-2.5-flash");
  });
});
