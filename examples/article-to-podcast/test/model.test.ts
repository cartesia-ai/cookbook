import { describe, expect, it } from "vitest";
import { ConfigError } from "../lib/env";
import { chooseModel, getModel } from "../lib/model";

describe("chooseModel", () => {
  it("uses the direct provider with the bare id when its key is set", () => {
    expect(chooseModel({ LLM_MODEL: "anthropic/claude-x", ANTHROPIC_API_KEY: "a", AI_GATEWAY_API_KEY: "g" })).toEqual({
      provider: "anthropic",
      id: "claude-x",
    });
    expect(chooseModel({ LLM_MODEL: " openai/gpt-x ", OPENAI_API_KEY: "o" })).toEqual({ provider: "openai", id: "gpt-x" });
  });
  it("sends the full id to the gateway when there is no direct key", () => {
    expect(chooseModel({ LLM_MODEL: "openai/gpt-x", ANTHROPIC_API_KEY: "a", AI_GATEWAY_API_KEY: "g" })).toEqual({
      provider: "gateway",
      id: "openai/gpt-x",
    });
    expect(chooseModel({ LLM_MODEL: "google/gemini-x", VERCEL: "1" })).toEqual({ provider: "gateway", id: "google/gemini-x" });
  });
  it("throws a ConfigError naming LLM_MODEL and no values when it is missing or has no provider", () => {
    for (const LLM_MODEL of [undefined, "", "sk-test-sentinel"]) {
      let err: unknown;
      try {
        chooseModel({ LLM_MODEL, OPENAI_API_KEY: "o" });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as Error).message).toContain("LLM_MODEL");
      expect((err as Error).message).not.toContain("sentinel");
    }
  });
  it("names the missing key", () => {
    expect(() => chooseModel({ LLM_MODEL: "anthropic/claude-x", OPENAI_API_KEY: "o" })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => chooseModel({ LLM_MODEL: "google/gemini-x" })).toThrow(/AI_GATEWAY_API_KEY/);
  });
});

describe("getModel", () => {
  it("returns an SDK model for a direct key and the id string for the gateway", () => {
    expect((getModel({ LLM_MODEL: "openai/gpt-x", OPENAI_API_KEY: "o" }) as { modelId: string }).modelId).toBe("gpt-x");
    expect(getModel({ LLM_MODEL: "openai/gpt-x", AI_GATEWAY_API_KEY: "g" })).toBe("openai/gpt-x");
  });
});
