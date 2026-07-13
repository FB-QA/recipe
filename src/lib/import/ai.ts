import { aiRecipeSchema, type AiRecipe, type ExtractedRecipe } from "./types";

const MODEL = "claude-haiku-4-5-20251001";
const INPUT_PER_M = 1.0;
const OUTPUT_PER_M = 5.0;

const SYSTEM =
  "You extract structured recipe data from unstructured text (recipe web pages " +
  "or social captions). Return ONLY data present in the source. If a field is not " +
  "stated, use null (scalars) or [] (lists). NEVER invent ingredients, quantities, " +
  "times, or servings that are not in the text.";

// JSON Schema mirror of aiRecipeSchema — forces valid structured output.
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    ingredients: { type: "array", items: { type: "string" } },
    steps: { type: "array", items: { type: "string" } },
    prep_time: { type: ["string", "null"] },
    cook_time: { type: ["string", "null"] },
    servings: { type: ["string", "null"] },
    tips: { type: "array", items: { type: "string" } },
  },
  required: ["title", "description", "ingredients", "steps", "prep_time", "cook_time", "servings", "tips"],
  additionalProperties: false,
};

/** Low-cost structured extraction from free text. Returns null on any failure
 *  (missing key, network, malformed output) — the caller degrades gracefully. */
export async function extractWithAi(
  text: string,
): Promise<{ recipe: AiRecipe; costCents: number } | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.length < 20 || !text.trim()) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
        messages: [{ role: "user", content: `Extract the recipe from this text:\n\n${text.slice(0, 12000)}` }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const textBlock = data.content?.find((b: { type: string }) => b.type === "text")?.text;
    if (!textBlock) return null;

    const parsed = aiRecipeSchema.safeParse(JSON.parse(textBlock));
    if (!parsed.success) return null;

    const usage = data.usage ?? { input_tokens: 0, output_tokens: 0 };
    const costCents =
      (usage.input_tokens / 1e6) * INPUT_PER_M * 100 +
      (usage.output_tokens / 1e6) * OUTPUT_PER_M * 100;

    return { recipe: parsed.data, costCents };
  } catch {
    return null;
  }
}

export function aiToExtracted(
  ai: AiRecipe,
  imageUrl: string | null,
  sourceHandle: string | null = null,
): ExtractedRecipe {
  return {
    title: ai.title?.trim() || "Untitled recipe",
    description: ai.description,
    servings: ai.servings,
    prep_time: ai.prep_time,
    cook_time: ai.cook_time,
    ingredients: ai.ingredients.filter(Boolean).map((display_text) => ({ display_text })),
    steps: ai.steps.filter(Boolean),
    tips: ai.tips.filter(Boolean),
    imageUrl,
    sourceHandle,
  };
}
