import { describe, expect, it } from "vitest";
import { createAnthropicProvider } from "./anthropic";
import type { NormalizedImportInput } from "../schema";

const INPUT: NormalizedImportInput = {
  sourceType: "pasted_text",
  modality: "text",
  text: "Ingredients: 500g chicken. Method: cook it.",
  evidenceWarnings: [],
};

const AI_RECIPE = {
  extractionStatus: "recipe",
  title: "Chicken",
  description: null,
  servings: { value: null, originalText: null },
  prepTimeMinutes: null,
  cookTimeMinutes: null,
  totalTimeMinutes: null,
  ingredientGroups: [],
  steps: [],
  tips: [],
  servingSuggestions: [],
  warnings: [],
  missingFields: [],
};

function okResponse(body: object) {
  return new Response(JSON.stringify(body), { status: 200 });
}

function messagesBody(text: string) {
  return {
    id: "msg_test",
    model: "claude-haiku-4-5",
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    usage: {
      input_tokens: 1200,
      output_tokens: 340,
      cache_read_input_tokens: 100,
      cache_creation_input_tokens: 0,
    },
  };
}

describe("createAnthropicProvider", () => {
  it("is unavailable without an API key", () => {
    const p = createAnthropicProvider({ apiKey: undefined });
    expect(p.supports(INPUT)).toBe(false);
  });

  it("does not support media modalities this story (§0.2)", () => {
    const p = createAnthropicProvider({ apiKey: "sk-test-0123456789012345678901234567" });
    expect(p.supports({ ...INPUT, modality: "video" })).toBe(false);
    expect(p.supports(INPUT)).toBe(true);
  });

  it("parses structured output and reports the usage block", async () => {
    let captured: RequestInit | undefined;
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      captured = init;
      return okResponse(messagesBody(JSON.stringify(AI_RECIPE)));
    }) as typeof fetch;

    const p = createAnthropicProvider({ apiKey: "sk-test-0123456789012345678901234567", fetchImpl });
    const r = await p.extract(INPUT, {});
    expect(r.ok).toBe(true);
    expect(r.recipe).toMatchObject({ title: "Chicken" });
    expect(r.usage.inputTextTokens).toBe(1200);
    expect(r.usage.outputTokensTotal).toBe(340);
    expect(r.usage.cachedInputTokens).toBe(100);

    // Model ID comes from configuration/adapter — and the request pins the
    // structured-output schema so invalid shapes are the provider's failure.
    const body = JSON.parse(String(captured?.body));
    expect(body.model).toBe("claude-haiku-4-5");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.system).toMatch(/Do not invent ingredients/);
  });

  it("classifies non-JSON payloads as schema_invalid (one correction allowed)", async () => {
    const fetchImpl = (async () => okResponse(messagesBody("not json at all"))) as typeof fetch;
    const p = createAnthropicProvider({ apiKey: "sk-test-0123456789012345678901234567", fetchImpl });
    const r = await p.extract(INPUT, {});
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("schema_invalid");
  });

  it("passes correction errors back to the model on the correction attempt", async () => {
    let body: { messages: Array<{ content: string }> } | undefined;
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return okResponse(messagesBody(JSON.stringify(AI_RECIPE)));
    }) as typeof fetch;
    const p = createAnthropicProvider({ apiKey: "sk-test-0123456789012345678901234567", fetchImpl });
    await p.extract(INPUT, { correctionErrors: ["ingredientGroups: required"] });
    expect(body?.messages.some((m) => String(m.content).includes("ingredientGroups: required"))).toBe(true);
  });

  it("maps HTTP statuses to §20 retry classes", async () => {
    const status = async (code: number) => {
      const fetchImpl = (async () => new Response("{}", { status: code })) as typeof fetch;
      const p = createAnthropicProvider({ apiKey: "sk-test-0123456789012345678901234567", fetchImpl });
      return (await p.extract(INPUT, {})).errorCode;
    };
    expect(await status(429)).toBe("rate_limited");
    expect(await status(529)).toBe("provider_error");
    expect(await status(500)).toBe("provider_error");
    expect(await status(401)).toBe("invalid_credentials");
    // A 400 means WE sent an invalid request (e.g. a schema over the union cap) —
    // a permanent fault, distinct from a transient provider error, so it must not
    // be retried and must not read as "service busy".
    expect(await status(400)).toBe("bad_request");
  });

  it("maps a refusal stop to safety_block", async () => {
    const fetchImpl = (async () =>
      okResponse({ ...messagesBody(""), stop_reason: "refusal", content: [] })) as typeof fetch;
    const p = createAnthropicProvider({ apiKey: "sk-test-0123456789012345678901234567", fetchImpl });
    const r = await p.extract(INPUT, {});
    expect(r.errorCode).toBe("safety_block");
  });
});
