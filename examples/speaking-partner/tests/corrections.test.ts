import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { clampCorrection, CorrectRequestSchema, correctLine, systemPrompt } from "../lib/corrections";
import { llmConfigured, resolveModel } from "../lib/model";

function modelReturning(json: unknown) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(json) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } },
      warnings: [],
    }),
  });
}

const req = { text: "Yo soy tiene hambre", target: "es", native: "en" } as const;

describe("correctLine", () => {
  it("returns a flagged correction", async () => {
    const model = modelReturning({ hasIssue: true, corrected: "Tengo hambre", explanation: "Use tener, not ser.", category: "grammar" });
    const out = await correctLine(model, req);
    expect(out).toEqual({ hasIssue: true, corrected: "Tengo hambre", explanation: "Use tener, not ser.", category: "grammar" });
    const prompt = JSON.stringify(model.doGenerateCalls[0]!.prompt);
    expect(prompt).toContain("Yo soy tiene hambre");
    expect(prompt).toContain("speech recognition");
  });

  it("never shows a fix that changes nothing", async () => {
    const model = modelReturning({ hasIssue: true, corrected: "Yo soy tiene hambre", explanation: "x", category: "grammar" });
    expect((await correctLine(model, req)).hasIssue).toBe(false);
  });

  it("passes a clean line through with an empty explanation", async () => {
    const model = modelReturning({ hasIssue: false, corrected: "ignored", explanation: "ignored", category: "grammar" });
    expect(await correctLine(model, { ...req, text: "Tengo hambre" })).toEqual({ hasIssue: false, corrected: "Tengo hambre", explanation: "", category: "other" });
  });
});

describe("clampCorrection", () => {
  it("trims and caps the explanation", () => {
    const out = clampCorrection({ hasIssue: true, corrected: "  Hola  ", explanation: "x".repeat(900), category: "other" }, "Ola");
    expect(out.corrected).toBe("Hola");
    expect(out.explanation).toHaveLength(400);
  });
});

describe("CorrectRequestSchema", () => {
  it("caps the text at 500 characters and allows only the five languages", () => {
    expect(CorrectRequestSchema.safeParse({ ...req, text: "a".repeat(501) }).success).toBe(false);
    expect(CorrectRequestSchema.safeParse({ ...req, text: "   " }).success).toBe(false);
    expect(CorrectRequestSchema.safeParse({ ...req, target: "de" }).success).toBe(false);
    expect(CorrectRequestSchema.safeParse(req).success).toBe(true);
  });
});

describe("systemPrompt", () => {
  it("names both languages and tells the model to ignore recognition noise", () => {
    const p = systemPrompt("ja", "en");
    expect(p).toContain("Japanese");
    expect(p).toContain("English");
    expect(p).toMatch(/kanji versus kana/);
    expect(systemPrompt("hi", "en")).toContain("Devanagari");
  });
});

describe("model choice", () => {
  it("is null until LLM_MODEL and a usable key exist, so the app can say so instead of failing", () => {
    expect(resolveModel({})).toBeNull();
    expect(resolveModel({ ANTHROPIC_API_KEY: "k" })).toBeNull();
    expect(resolveModel({ LLM_MODEL: "anthropic/claude-x" })).toBeNull();
    expect(resolveModel({ LLM_MODEL: "claude-x", ANTHROPIC_API_KEY: "k" })).toBeNull();
    expect(resolveModel({ LLM_MODEL: "google/gemini-x", OPENAI_API_KEY: "k" })).toBeNull();
  });

  it("uses the direct provider with the bare id when its key is set", () => {
    const anthropic = resolveModel({ LLM_MODEL: "anthropic/claude-x", ANTHROPIC_API_KEY: "k" });
    expect(anthropic?.label).toBe("anthropic/claude-x");
    expect((anthropic?.model as { modelId: string }).modelId).toBe("claude-x");
    const openai = resolveModel({ LLM_MODEL: " openai/gpt-x ", OPENAI_API_KEY: "k" });
    expect((openai?.model as { modelId: string }).modelId).toBe("gpt-x");
  });

  it("sends the full id to the AI Gateway when there is no direct key", () => {
    expect(resolveModel({ LLM_MODEL: "openai/gpt-x", AI_GATEWAY_API_KEY: "k" })?.model).toBe("openai/gpt-x");
    expect(resolveModel({ LLM_MODEL: "google/gemini-x", VERCEL: "1" })?.model).toBe("google/gemini-x");
  });

  it("llmConfigured matches resolveModel", () => {
    expect(llmConfigured({ LLM_MODEL: "openai/gpt-x" })).toBe(false);
    expect(llmConfigured({ LLM_MODEL: "openai/gpt-x", OPENAI_API_KEY: "k" })).toBe(true);
  });
});
