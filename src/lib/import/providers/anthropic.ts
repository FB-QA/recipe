import { importConfig } from "../config";
import {
  EMPTY_USAGE,
  type ExtractionContext,
  type NormalizedImportInput,
  type ProviderExtractionResult,
  type ProviderUsage,
  type RecipeExtractionProvider,
} from "../schema";

/**
 * §15 — the Claude extraction adapter. The live primary (§0.1). Talks to the
 * Messages API directly (the project carries no SDK dependency); structured
 * output pins the §18 schema so the model cannot return a divergent shape
 * without it being a classifiable `schema_invalid` failure.
 * Nothing outside this adapter touches Anthropic response formats.
 */

/** §17 — the extraction system instruction, all providers, verbatim. */
export const EXTRACTION_SYSTEM_PROMPT = [
  "You extract recipes from supplied source evidence for Cookdex.",
  "Use only information that appears in the supplied evidence.",
  "Do not invent ingredients, quantities, temperatures, timings, servings,",
  "equipment, headings or instructions.",
  "Use null or an empty collection when information is missing.",
  "Preserve original ingredient wording.",
  "Preserve ingredient section order and ingredient order within sections.",
  "Only create a separate ingredient section when the source gives it an explicit",
  "name or heading (e.g. 'For the sauce', 'For the base'). Do NOT split ingredients",
  "into sections from blank lines, line breaks or spacing alone — put those in a",
  "single unnamed section. Never leave a section unnamed unless it is the only one.",
  "Preserve cooking-step order.",
  "Recognise quantity ranges without selecting one guessed value.",
  "Extract nutrition (calories, protein, carbs, fat) only when the source states it,",
  "using the exact amounts written; set perServing true when it is per portion.",
  "Never calculate or estimate nutrition — null any macro the source omits.",
  "Recognise optional ingredients and optional sections.",
  "Recognise true ingredient alternatives.",
  'Do not treat every use of "or" as an alternative choice.',
  "Do not convert units unless the source includes that conversion.",
  "If the source is not a recipe, return not_recipe.",
  "If the source refers to unavailable recipe content, return insufficient_content.",
  "Report contradictions, missing content and unreadable evidence as warnings.",
].join("\n");

/** JSON Schema mirror of aiExtractedRecipeSchema — forces valid structured output. */
const nullable = (type: string) => ({ type: [type, "null"] });
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    extractionStatus: { type: "string", enum: ["recipe", "not_recipe", "insufficient_content"] },
    title: nullable("string"),
    description: nullable("string"),
    servings: {
      type: "object",
      properties: { value: nullable("number"), originalText: nullable("string") },
      required: ["value", "originalText"],
      additionalProperties: false,
    },
    nutrition: {
      type: ["object", "null"],
      properties: {
        calories: nullable("string"),
        protein: nullable("string"),
        carbs: nullable("string"),
        fat: nullable("string"),
        perServing: nullable("boolean"),
      },
      required: ["calories", "protein", "carbs", "fat", "perServing"],
      additionalProperties: false,
    },
    prepTimeMinutes: nullable("number"),
    cookTimeMinutes: nullable("number"),
    totalTimeMinutes: nullable("number"),
    ingredientGroups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          temporaryId: { type: "string" },
          name: nullable("string"),
          position: { type: "integer" },
          optional: { type: "boolean" },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                temporaryId: { type: "string" },
                position: { type: "integer" },
                originalText: { type: "string" },
                quantityText: nullable("string"),
                quantityValue: nullable("number"),
                quantityMin: nullable("number"),
                quantityMax: nullable("number"),
                unit: nullable("string"),
                name: { type: "string" },
                preparation: nullable("string"),
                optional: { type: "boolean" },
                alternativeGroupId: nullable("string"),
              },
              required: [
                "temporaryId", "position", "originalText", "quantityText", "quantityValue",
                "quantityMin", "quantityMax", "unit", "name", "preparation", "optional",
                "alternativeGroupId",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["temporaryId", "name", "position", "optional", "ingredients"],
        additionalProperties: false,
      },
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          position: { type: "integer" },
          title: nullable("string"),
          instruction: { type: "string" },
          ingredientGroupReferences: { type: "array", items: { type: "string" } },
        },
        required: ["position", "title", "instruction", "ingredientGroupReferences"],
        additionalProperties: false,
      },
    },
    tips: { type: "array", items: { type: "string" } },
    servingSuggestions: { type: "array", items: { type: "string" } },
    warnings: {
      type: "array",
      items: {
        type: "object",
        properties: { code: { type: "string" }, message: { type: "string" } },
        required: ["code", "message"],
        additionalProperties: false,
      },
    },
    missingFields: { type: "array", items: { type: "string" } },
  },
  required: [
    "extractionStatus", "title", "description", "servings", "nutrition", "prepTimeMinutes",
    "cookTimeMinutes", "totalTimeMinutes", "ingredientGroups", "steps", "tips",
    "servingSuggestions", "warnings", "missingFields",
  ],
  additionalProperties: false,
} as const;

const MAX_SOURCE_CHARS = 12_000;
const TIMEOUT_MS = 45_000;

interface AnthropicUsageBlock {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

function usageFrom(raw: AnthropicUsageBlock | undefined): ProviderUsage {
  return {
    ...EMPTY_USAGE,
    inputTextTokens: raw?.input_tokens ?? null,
    cachedInputTokens: raw?.cache_read_input_tokens ?? null,
    cacheCreationInputTokens: raw?.cache_creation_input_tokens ?? null,
    outputCandidateTokens: raw?.output_tokens ?? null,
    outputTokensTotal: raw?.output_tokens ?? null,
    raw: raw ?? null,
  };
}

export function createAnthropicProvider(options?: {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): RecipeExtractionProvider {
  const config = importConfig();
  const apiKey = options && "apiKey" in options ? options.apiKey : config.anthropicApiKey;
  const modelId = options?.model ?? config.primaryModel;
  const doFetch = options?.fetchImpl ?? fetch;

  return {
    providerId: "anthropic",
    serviceId: "messages",
    modelId,

    supports(input: NormalizedImportInput): boolean {
      if (!apiKey || apiKey.length < 20) return false;
      // §0.2 — no video/image input this story; multimodal arrives with the
      // capture flow (and image support already exists at the API).
      return input.modality === "text" && Boolean(input.text?.trim());
    },

    async extract(input, context: ExtractionContext): Promise<ProviderExtractionResult> {
      const messages: Array<{ role: "user"; content: string }> = [
        {
          role: "user",
          content: `Extract the recipe from this source evidence:\n\n${(input.text ?? "").slice(0, MAX_SOURCE_CHARS)}`,
        },
      ];
      if (context.correctionErrors?.length) {
        // §20 — exactly one targeted correction carrying the validation errors.
        messages.push({
          role: "user",
          content:
            "Your previous output failed schema validation. Correct ONLY these issues and return the full JSON again:\n" +
            context.correctionErrors.map((e) => `- ${e}`).join("\n"),
        });
      }

      let res: Response;
      try {
        res = await doFetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey ?? "",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: modelId,
            max_tokens: 4096,
            system: EXTRACTION_SYSTEM_PROMPT,
            output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
            messages,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
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
        id?: string;
        model?: string;
        stop_reason?: string;
        content?: Array<{ type: string; text?: string }>;
        usage?: AnthropicUsageBlock;
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

      const usage = usageFrom(data.usage);
      const common = {
        providerRequestId: data.id ?? null,
        modelVersion: data.model ?? null,
        finishReason: data.stop_reason ?? null,
        usage,
      };

      if (data.stop_reason === "refusal") {
        return { ok: false, errorCode: "safety_block", errorMessageSafe: "provider declined the content", ...common };
      }

      const textBlock = data.content?.find((b) => b.type === "text")?.text;
      if (!textBlock) {
        return { ok: false, errorCode: "schema_invalid", errorMessageSafe: "no text block in response", ...common };
      }

      try {
        return { ok: true, recipe: JSON.parse(textBlock), ...common };
      } catch {
        return { ok: false, errorCode: "schema_invalid", errorMessageSafe: "response was not valid JSON", ...common };
      }
    },
  };
}
