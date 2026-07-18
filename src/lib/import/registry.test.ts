import { describe, expect, it } from "vitest";
import { buildResolverChain, selectPrimaryProvider } from "./registry";
import type { ImportAiConfig } from "./config";
import type { ImportRequest } from "./schema";

const baseConfig: ImportAiConfig = {
  primaryProvider: "anthropic",
  primaryModel: "claude-haiku-4-5",
  replacementModel: null,
  fallbackEnabled: false,
  anthropicApiKey: "sk-ant-".padEnd(40, "x"),
  googleApiKey: undefined,
  apifyToken: undefined,
  planEnforcementEnabled: false, reelCoverEnrich: true,
};

const req = (over: Partial<ImportRequest>): ImportRequest => ({
  sourceKind: "instagram_post",
  url: "https://www.instagram.com/p/abc/",
  text: null,
  userId: "u1",
  importId: "imp1",
  ...over,
});

describe("buildResolverChain — ordering + config gating (AC3, AC9)", () => {
  it("pasted text → single resolver", () => {
    const { chain, gatedOut } = buildResolverChain(req({ sourceKind: "pasted_text", url: null, text: "x" }), baseConfig);
    expect(chain.map((r) => r.resolverId)).toEqual(["pasted_text"]);
    expect(gatedOut).toEqual([]);
  });

  it("website → single resolver", () => {
    const { chain } = buildResolverChain(req({ sourceKind: "website", url: "https://x.test" }), baseConfig);
    expect(chain.map((r) => r.resolverId)).toEqual(["website_direct"]);
  });

  it("instagram with no keys → direct only, both cheaper-than-user rungs recorded as gated-out", () => {
    const { chain, gatedOut } = buildResolverChain(req({}), baseConfig);
    expect(chain.map((r) => r.resolverId)).toEqual(["instagram_direct"]);
    expect(gatedOut.map((g) => g.resolverId)).toEqual(["gemini_url_context", "apify_instagram"]);
    expect(gatedOut.find((g) => g.resolverId === "gemini_url_context")?.reason).toBe("no_google_api_key");
  });

  it("instagram with an Apify token → direct then Apify; URL-context still gated out", () => {
    const { chain, gatedOut } = buildResolverChain(req({}), { ...baseConfig, apifyToken: "apify_xxx" });
    expect(chain.map((r) => r.resolverId)).toEqual(["instagram_direct", "apify_instagram"]);
    expect(gatedOut.map((g) => g.resolverId)).toEqual(["gemini_url_context"]);
  });

  it("instagram with both keys → the full ordered chain, nothing gated", () => {
    const { chain, gatedOut } = buildResolverChain(req({}), {
      ...baseConfig,
      googleApiKey: "goog_xxx",
      apifyToken: "apify_xxx",
    });
    expect(chain.map((r) => r.resolverId)).toEqual(["instagram_direct", "gemini_url_context", "apify_instagram"]);
    expect(gatedOut).toEqual([]);
  });
});

describe("selectPrimaryProvider — configuration-only switch (AC9)", () => {
  it("returns the Anthropic adapter by default", () => {
    expect(selectPrimaryProvider(baseConfig).providerId).toBe("anthropic");
  });

  it("returns the Gemini adapter when configured to google", () => {
    const p = selectPrimaryProvider({ ...baseConfig, primaryProvider: "google", googleApiKey: "goog_xxx", primaryModel: "gemini-2.5-flash-lite" });
    expect(p.providerId).toBe("google");
    expect(p.modelId).toBe("gemini-2.5-flash-lite");
  });
});
