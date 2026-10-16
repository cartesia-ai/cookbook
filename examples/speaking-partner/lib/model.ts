import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

type Env = Record<string, string | undefined>;

export function llmConfigured(env: Env = process.env): boolean {
  const id = env.LLM_MODEL?.trim();
  if (!id || !id.includes("/")) return false;
  const [provider] = id.split("/");
  if (provider === "openai" && env.OPENAI_API_KEY) return true;
  if (provider === "anthropic" && env.ANTHROPIC_API_KEY) return true;
  return Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL);
}

export function resolveModel(env: Env = process.env): { model: LanguageModel; label: string } | null {
  if (!llmConfigured(env)) return null;
  const id = env.LLM_MODEL!.trim();
  const slash = id.indexOf("/");
  const provider = id.slice(0, slash);
  const bare = id.slice(slash + 1);
  if (provider === "openai" && env.OPENAI_API_KEY) {
    return { model: createOpenAI({ apiKey: env.OPENAI_API_KEY })(bare), label: id };
  }
  if (provider === "anthropic" && env.ANTHROPIC_API_KEY) {
    return { model: createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(bare), label: id };
  }
  return { model: id, label: id };
}
