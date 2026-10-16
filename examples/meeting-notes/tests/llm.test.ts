import { describe, expect, it } from "vitest";
import { getModel, llmConfigured, LlmConfigError } from "@/lib/llm";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe("getModel", () => {
  it("uses the direct OpenAI provider with the bare id when the key is set", () => {
    const model = getModel(env({ LLM_MODEL: "openai/gpt-x", OPENAI_API_KEY: "k" }));
    expect(typeof model).toBe("object");
    expect((model as { modelId: string }).modelId).toBe("gpt-x");
  });

  it("uses the direct Anthropic provider with the bare id when the key is set", () => {
    const model = getModel(env({ LLM_MODEL: "anthropic/claude-x", ANTHROPIC_API_KEY: "k" }));
    expect((model as { modelId: string }).modelId).toBe("claude-x");
  });

  it("returns the prefixed string for the gateway when only the gateway key is set", () => {
    expect(getModel(env({ LLM_MODEL: "openai/gpt-x", AI_GATEWAY_API_KEY: "k" }))).toBe("openai/gpt-x");
  });

  it("sends an unknown prefix to the gateway", () => {
    expect(getModel(env({ LLM_MODEL: "google/gemini-x", AI_GATEWAY_API_KEY: "k" }))).toBe("google/gemini-x");
  });

  it("throws a clear error for an unknown prefix with no gateway key", () => {
    expect(() => getModel(env({ LLM_MODEL: "google/gemini-x" }))).toThrow(LlmConfigError);
  });

  it("throws when LLM_MODEL is missing or has no provider", () => {
    expect(() => getModel(env({}))).toThrow(/LLM_MODEL/);
    expect(() => getModel(env({ LLM_MODEL: "gpt-x" }))).toThrow(/LLM_MODEL/);
  });
});

describe("llmConfigured", () => {
  it("is false until a model and a usable key exist", () => {
    expect(llmConfigured(env({}))).toBe(false);
    expect(llmConfigured(env({ LLM_MODEL: "openai/gpt-x" }))).toBe(false);
    expect(llmConfigured(env({ LLM_MODEL: "openai/gpt-x", OPENAI_API_KEY: "k" }))).toBe(true);
    expect(llmConfigured(env({ LLM_MODEL: "anthropic/c", AI_GATEWAY_API_KEY: "k" }))).toBe(true);
  });
});
