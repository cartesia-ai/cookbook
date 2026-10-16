import { describe, expect, it } from "vitest";
import { ConfigError } from "../lib/env";
import { chooseModel } from "../lib/model";

describe("chooseModel", () => {
  it("prefers the gateway", () => {
    expect(chooseModel({ AI_GATEWAY_API_KEY: "g", ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" })).toEqual({
      provider: "gateway",
      id: "anthropic/claude-sonnet-5.5",
    });
  });
  it("then anthropic", () => {
    expect(chooseModel({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" })).toEqual({ provider: "anthropic", id: "claude-sonnet-5-5" });
  });
  it("then openai", () => {
    expect(chooseModel({ OPENAI_API_KEY: "o" })).toEqual({ provider: "openai", id: "gpt-5.4-mini" });
  });
  it("ignores empty values", () => {
    expect(chooseModel({ AI_GATEWAY_API_KEY: "", ANTHROPIC_API_KEY: " ", OPENAI_API_KEY: "o" }).provider).toBe("openai");
  });
  it("throws a ConfigError that names variables and no values", () => {
    let err: unknown;
    try {
      chooseModel({ PODCAST_MODEL: "sk-test-sentinel" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigError);
    const message = (err as Error).message;
    expect(message).toContain("AI_GATEWAY_API_KEY");
    expect(message).toContain("ANTHROPIC_API_KEY");
    expect(message).toContain("OPENAI_API_KEY");
    expect(message).not.toContain("sentinel");
  });
  it("PODCAST_MODEL changes the id but never the provider", () => {
    expect(chooseModel({ ANTHROPIC_API_KEY: "a", PODCAST_MODEL: "anthropic/claude-sonnet-5.5" })).toEqual({
      provider: "anthropic",
      id: "anthropic/claude-sonnet-5.5",
    });
    expect(chooseModel({ AI_GATEWAY_API_KEY: "g", PODCAST_MODEL: "openai/gpt-6-luna" })).toEqual({
      provider: "gateway",
      id: "openai/gpt-6-luna",
    });
  });
});
