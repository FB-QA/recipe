import { createHash } from "node:crypto";
import { importConfig } from "../config";
import { classifyInstagramUrl } from "./instagram-direct";
import type {
  ImportRequest,
  SourceEvidence,
  SourceEvidenceWarning,
  SourceResolver,
  SourceResolverResult,
} from "../schema";

/**
 * §9.2 — GeminiUrlContextInstagramResolver, the config-gated second rung.
 * Two-stage flow: Stage 1 asks the model to inspect the public page and
 * return SOURCE EVIDENCE ONLY — never to complete the recipe. Stage 2
 * normalises that into SourceEvidence. Never assumes URL Context followed
 * carousel links, watched video, or bypassed a login wall; generic
 * "this page is a recipe" descriptions are rejected as evidence.
 *
 * Registered only when GOOGLE_API_KEY is present (§0.1); the engine records
 * the skipped rung as `unavailable` — never silently absent. Live
 * verification is deferred per spec §0.4–0.5.
 */

const STAGE1_PROMPT = [
  "Inspect the public Instagram page at the URL provided using the URL context tool.",
  "Return ONLY source evidence as JSON — do NOT complete, summarise or invent any recipe content:",
  "{",
  '  "captionVisible": string | null,   // the caption text exactly as visible, or null',
  '  "creatorName": string | null,',
  '  "postType": "single_image" | "carousel" | "reel" | "unknown",',
  '  "fullRecipeVisible": boolean,      // is a complete recipe visible in text?',
  '  "recipeInBio": boolean,            // does the caption defer to a bio/profile link?',
  '  "dependsOnVideoOrAudio": boolean,',
  '  "loginWall": boolean               // page demanded a login instead of content',
  "}",
].join("\n");

interface Stage1Evidence {
  captionVisible: string | null;
  creatorName: string | null;
  postType: "single_image" | "carousel" | "reel" | "unknown";
  fullRecipeVisible: boolean;
  recipeInBio: boolean;
  dependsOnVideoOrAudio: boolean;
  loginWall: boolean;
}

const GEMINI_MODEL = "gemini-3.1-flash-lite"; // 2.5-flash-lite is closed to new keys (§3.4)
const TIMEOUT_MS = 45_000;

export function createGeminiUrlContextResolver(options?: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): SourceResolver {
  const apiKey = options && "apiKey" in options ? options.apiKey : importConfig().googleApiKey;
  const doFetch = options?.fetchImpl ?? fetch;

  return {
    resolverId: "gemini_url_context",
    providerId: "google",
    serviceId: "url_context",

    supports(request: ImportRequest): boolean {
      return Boolean(apiKey) && request.url !== null && classifyInstagramUrl(request.url) !== null;
    },

    async resolve(request: ImportRequest): Promise<SourceResolverResult> {
      const sourceType = classifyInstagramUrl(request.url ?? "") ?? "instagram_post";
      const evidence = (over: Partial<SourceEvidence>): SourceEvidence => ({
        sourceType,
        sourceUrl: request.url,
        retrievalStatus: "unavailable",
        resolverId: "gemini_url_context",
        resolverAttemptId: "",
        postType: "unknown",
        caption: null,
        title: null,
        creatorName: null,
        media: [],
        evidenceWarnings: [],
        contentFingerprint: null,
        retrievedAt: new Date().toISOString(),
        ...over,
      });

      let res: Response;
      try {
        res = await doFetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
          {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": apiKey ?? "" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: STAGE1_PROMPT }] },
              contents: [{ role: "user", parts: [{ text: request.url }] }],
              tools: [{ url_context: {} }],
              generationConfig: { responseMimeType: "application/json" },
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          },
        );
      } catch (err) {
        const timedOut = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
        return { evidence: evidence({}), cost: null, failure: timedOut ? "source_timeout" : "source_retrieval_failed" };
      }

      if (!res.ok) {
        return {
          evidence: evidence({}),
          cost: null,
          failure: "source_retrieval_failed",
          responseStatus: res.status,
        };
      }

      let usage: { promptTokenCount?: number; candidatesTokenCount?: number } = {};
      let stage1: Stage1Evidence | null = null;
      try {
        const data = await res.json();
        usage = data.usageMetadata ?? {};
        const text: string = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
        stage1 = JSON.parse(text) as Stage1Evidence;
      } catch {
        stage1 = null;
      }

      const cost = {
        providerId: "google",
        serviceId: "url_context",
        unitsUsed: (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0),
        unitType: "input_token", // input+output split is priced by the engine from the raw block
        rawUsage: usage,
      };

      if (!stage1) {
        return { evidence: evidence({}), cost, failure: "source_retrieval_failed", responseStatus: res.status };
      }

      // Stage 2 — normalise into SourceEvidence, trusting nothing implicit.
      const warnings: SourceEvidenceWarning[] = [];
      if (stage1.loginWall) warnings.push("login_wall_detected");
      if (!stage1.captionVisible) warnings.push("caption_missing");
      if (stage1.postType === "carousel") warnings.push("carousel_items_missing");
      if (stage1.dependsOnVideoOrAudio) warnings.push("video_unavailable");
      if (!stage1.fullRecipeVisible) warnings.push("unknown_completeness");

      const caption = stage1.captionVisible?.trim() || null;
      return {
        evidence: evidence({
          retrievalStatus: stage1.loginWall ? "unavailable" : stage1.fullRecipeVisible && caption ? "complete" : "partial",
          postType: stage1.postType,
          caption,
          creatorName: stage1.creatorName,
          evidenceWarnings: warnings,
          contentFingerprint: caption ? createHash("sha256").update(caption).digest("hex").slice(0, 32) : null,
        }),
        cost,
        responseStatus: res.status,
        failure: stage1.loginWall ? "login_wall_detected" : null,
      };
    },
  };
}
