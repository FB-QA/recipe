import { importConfig } from "../config";
import { EXTRACTION_SYSTEM_PROMPT } from "./anthropic";
import {
  EMPTY_USAGE,
  type ExtractionContext,
  type NormalizedImportInput,
  type ProviderExtractionResult,
  type ProviderUsage,
  type RecipeExtractionProvider,
} from "../schema";

/**
 * §0.1 — GeminiRecipeExtractionProvider. Implemented to the provider
 * interface but REGISTERED ONLY when GOOGLE_API_KEY is present; without the
 * key it reports itself unavailable rather than silently vanishing (AC9).
 * Live verification is deferred with the §29 benchmark (spec §0.4–0.5).
 */

const GEMINI_MODEL_DEFAULT = "gemini-2.5-flash-lite";
const TIMEOUT_MS = 45_000;

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  totalTokenCount?: number;
}

function usageFrom(raw: GeminiUsageMetadata | undefined): ProviderUsage {
  return {
    ...EMPTY_USAGE,
    inputTextTokens: raw?.promptTokenCount ?? null,
    cachedInputTokens: raw?.cachedContentTokenCount ?? null,
    outputCandidateTokens: raw?.candidatesTokenCount ?? null,
    outputThinkingTokens: raw?.thoughtsTokenCount ?? null,
    outputTokensTotal:
      raw?.candidatesTokenCount !== undefined || raw?.thoughtsTokenCount !== undefined
        ? (raw?.candidatesTokenCount ?? 0) + (raw?.thoughtsTokenCount ?? 0)
        : null,
    raw: raw ?? null,
  };
}

export function createGeminiProvider(options?: {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): RecipeExtractionProvider {
  const config = importConfig();
  const apiKey = options && "apiKey" in options ? options.apiKey : config.googleApiKey;
  const modelId =
    options?.model ?? (config.primaryProvider === "google" ? config.primaryModel : GEMINI_MODEL_DEFAULT);
  const doFetch = options?.fetchImpl ?? fetch;

  return {
    providerId: "google",
    serviceId: "messages",
    modelId,

    supports(input: NormalizedImportInput): boolean {
      if (!apiKey) return false;
      return input.modality === "text" && Boolean(input.text?.trim());
    },

    async extract(input, context: ExtractionContext): Promise<ProviderExtractionResult> {
      const parts: Array<{ text: string }> = [
        { text: `Extract the recipe from this source evidence:\n\n${(input.text ?? "").slice(0, 12_000)}` },
      ];
      if (context.correctionErrors?.length) {
        parts.push({
          text:
            "Your previous output failed schema validation. Correct ONLY these issues and return the full JSON again:\n" +
            context.correctionErrors.map((e) => `- ${e}`).join("\n"),
        });
      }

      let res: Response;
      try {
        res = await doFetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
          {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": apiKey ?? "" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: EXTRACTION_SYSTEM_PROMPT }] },
              contents: [{ role: "user", parts }],
              generationConfig: { responseMimeType: "application/json" },
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          },
        );
      } catch (err) {
        const timedOut = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
        return {
          ok: false,
          errorCode: timedOut ? "timeout" : "connection_failed",
          errorMessageSafe: timedOut ? "provider request timed out" : "provider unreachable",
          usage: usageFrom(undefined),
        };
      }

      if (!res.ok) {
        const errorCode =
          res.status === 429
            ? ("rate_limited" as const)
            : res.status === 401 || res.status === 403
              ? ("invalid_credentials" as const)
              : ("provider_error" as const);
        return {
          ok: false,
          errorCode,
          errorMessageSafe: `provider returned HTTP ${res.status}`,
          usage: usageFrom(undefined),
        };
      }

      let data: {
        candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: GeminiUsageMetadata;
      };
      try {
        data = await res.json();
      } catch {
        return {
          ok: false,
          errorCode: "provider_error",
          errorMessageSafe: "provider returned unreadable payload",
          usage: usageFrom(undefined),
        };
      }

      const usage = usageFrom(data.usageMetadata);
      const candidate = data.candidates?.[0];
      const common = {
        providerRequestId: null,
        modelVersion: modelId,
        finishReason: candidate?.finishReason ?? null,
        usage,
      };

      if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
        return { ok: false, errorCode: "safety_block", errorMessageSafe: "provider declined the content", ...common };
      }

      const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) {
        return { ok: false, errorCode: "schema_invalid", errorMessageSafe: "no text in response", ...common };
      }
      try {
        return { ok: true, recipe: JSON.parse(text), ...common };
      } catch {
        return { ok: false, errorCode: "schema_invalid", errorMessageSafe: "response was not valid JSON", ...common };
      }
    },
  };
}
