import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { ConfigError } from "./env";

export type ModelChoice = { provider: "gateway" | "anthropic" | "openai"; id: string };

const DEFAULT_IDS = {
  gateway: "anthropic/claude-sonnet-5.5",
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-5.4-mini",
} as const;

export function chooseModel(env: Record<string, string | undefined> = process.env): ModelChoice {
  const override = env.PODCAST_MODEL?.trim();
  const has = (k: string) => Boolean(env[k]?.trim());
  const provider = has("AI_GATEWAY_API_KEY")
    ? "gateway"
    : has("ANTHROPIC_API_KEY")
      ? "anthropic"
      : has("OPENAI_API_KEY")
        ? "openai"
        : null;
  if (!provider) {
    throw new ConfigError("Set one LLM key in .env.local: AI_GATEWAY_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY.");
  }
  return { provider, id: override || DEFAULT_IDS[provider] };
}

export function getModel(env: Record<string, string | undefined> = process.env): LanguageModel {
  const { provider, id } = chooseModel(env);
  if (provider === "gateway") return id;
  if (provider === "anthropic") return anthropic(id);
  return openai(id);
}
