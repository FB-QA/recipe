import { describe, expect, it } from "vitest";
import { createGeminiUrlContextResolver } from "./gemini-url-context";
import type { ImportRequest } from "../schema";

/**
 * URL-context resolver: it must not trust the model's self-reported evidence
 * unless the tool actually retrieved the page, must survive valid-but-wrong-shape
 * JSON without crashing, and must return a token breakdown for correct pricing.
 */

const req: ImportRequest = {
  sourceKind: "instagram_post",
  url: "https://www.instagram.com/p/ABC123/",
  text: null,
  userId: "u1",
  importId: "imp1",
};

function mockFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return (async () =>
    ({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => body,
    }) as unknown as Response) as typeof fetch;
}

const RETRIEVED_META = { urlContextMetadata: { urlMetadata: [{ retrievedUrl: req.url, urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" }] } };

function candidate(stage1: unknown, meta: object = RETRIEVED_META) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(stage1) }] }, ...meta }],
    usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 100, toolUsePromptTokenCount: 1000 },
  };
}

describe("gemini url-context resolver", () => {
  it("accepts model evidence only when the tool actually retrieved the page", async () => {
    const resolver = createGeminiUrlContextResolver({
      apiKey: "k",
      fetchImpl: mockFetch(
        candidate({ captionVisible: "Ingredients: 2 eggs. Method: fry.", creatorName: "cook", postType: "single_image", fullRecipeVisible: true, recipeInBio: false, dependsOnVideoOrAudio: false, loginWall: false }),
      ),
    });
    const result = await resolver.resolve(req, { previousEvidence: [] });
    expect(result.failure).toBeNull();
    expect(result.evidence.retrievalStatus).toBe("complete");
    expect(result.evidence.caption).toContain("2 eggs");
    // Token breakdown carried for model-aware pricing.
    expect(result.cost?.tokens).toEqual({ inputTokens: 200, outputTokens: 100, toolUseTokens: 1000 });
    expect(result.cost?.modelId).toBe("gemini-3.1-flash-lite");
  });

  it("rejects model evidence when the URL-context tool did not retrieve the page (3984)", async () => {
    const resolver = createGeminiUrlContextResolver({
      apiKey: "k",
      // Model returns a confident caption, but no successful url retrieval status.
      fetchImpl: mockFetch(
        candidate(
          { captionVisible: "Ingredients: 2 eggs. Method: fry.", creatorName: "cook", postType: "single_image", fullRecipeVisible: true, recipeInBio: false, dependsOnVideoOrAudio: false, loginWall: false },
          { urlContextMetadata: { urlMetadata: [{ retrievedUrl: req.url, urlRetrievalStatus: "URL_RETRIEVAL_STATUS_ERROR" }] } },
        ),
      ),
    });
    const result = await resolver.resolve(req, { previousEvidence: [] });
    expect(result.failure).toBe("source_retrieval_failed");
    expect(result.evidence.retrievalStatus).not.toBe("complete");
    // Cost is still recorded — the paid call happened.
    expect(result.cost?.tokens).toBeTruthy();
  });

  it("does not crash on valid JSON of the wrong shape (90883)", async () => {
    const resolver = createGeminiUrlContextResolver({
      apiKey: "k",
      // captionVisible a number, postType an unexpected string.
      fetchImpl: mockFetch(candidate({ captionVisible: 123, creatorName: null, postType: "weird", fullRecipeVisible: "yes", recipeInBio: false, dependsOnVideoOrAudio: false, loginWall: false })),
    });
    const result = await resolver.resolve(req, { previousEvidence: [] });
    // Coerced safely: number caption → null, unknown postType → "unknown"; no throw.
    expect(result.evidence.caption).toBeNull();
    expect(result.evidence.postType).toBe("unknown");
  });

  it("returns a classified failure when the response is not a JSON object", async () => {
    const resolver = createGeminiUrlContextResolver({
      apiKey: "k",
      fetchImpl: mockFetch(candidate(42)),
    });
    const result = await resolver.resolve(req, { previousEvidence: [] });
    expect(result.failure).toBe("source_retrieval_failed");
  });
});
