import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { clampCorrection, CorrectRequestSchema, correctLine, systemPrompt } from "../lib/corrections";
import { DEFAULT_ANTHROPIC_MODEL, DEFAULT_OPENAI_MODEL, parseModelSpec, resolveModel } from "../lib/model";

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
  it("parses provider:model", () => {
    expect(parseModelSpec("anthropic:claude-x")).toEqual({ provider: "anthropic", id: "claude-x" });
    expect(parseModelSpec("openai:gpt:odd")).toEqual({ provider: "openai", id: "gpt:odd" });
    for (const bad of [undefined, "", "claude-x", "azure:gpt-x", "openai:"]) expect(parseModelSpec(bad)).toBeNull();
  });

  it("is null without a key, so the app can say so instead of failing", () => {
    expect(resolveModel({})).toBeNull();
    expect(resolveModel({ CORRECTIONS_MODEL: "anthropic:claude-x" })).toBeNull();
  });

  it("picks a small default for whichever key is set", () => {
    expect(resolveModel({ ANTHROPIC_API_KEY: "k" })?.label).toBe(`anthropic:${DEFAULT_ANTHROPIC_MODEL}`);
    expect(resolveModel({ OPENAI_API_KEY: "k" })?.label).toBe(`openai:${DEFAULT_OPENAI_MODEL}`);
    expect(resolveModel({ OPENAI_API_KEY: "k", CORRECTIONS_MODEL: "openai:gpt-x" })?.label).toBe("openai:gpt-x");
  });

  it("keeps old-generation ids out of the defaults", () => {
    for (const id of [DEFAULT_ANTHROPIC_MODEL, DEFAULT_OPENAI_MODEL]) expect(id).not.toMatch(/claude-3|gpt-3|gpt-4(?!\.1)|instruct|davinci/);
  });
});
