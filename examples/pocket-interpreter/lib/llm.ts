import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export class LlmConfigError extends Error {}

export function llmConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const id = env.LLM_MODEL?.trim();
  if (!id || !id.includes("/")) return false;
  const [provider] = id.split("/");
  if (provider === "openai" && env.OPENAI_API_KEY) return true;
  if (provider === "anthropic" && env.ANTHROPIC_API_KEY) return true;
  return Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL);
}

export function getModel(env: NodeJS.ProcessEnv = process.env): LanguageModel {
  const id = env.LLM_MODEL?.trim();
  if (!id || !id.includes("/")) {
    throw new LlmConfigError("LLM_MODEL is not set. Use provider/model, for example openai/gpt-5.4-mini.");
  }
  const slash = id.indexOf("/");
  const provider = id.slice(0, slash);
  const bare = id.slice(slash + 1);

  if (provider === "openai" && env.OPENAI_API_KEY) {
    return createOpenAI({ apiKey: env.OPENAI_API_KEY })(bare);
  }
  if (provider === "anthropic" && env.ANTHROPIC_API_KEY) {
    return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(bare);
  }
  if (env.AI_GATEWAY_API_KEY || env.VERCEL) return id;

  throw new LlmConfigError(
    `No key for "${provider}". Set ${
      provider === "openai" ? "OPENAI_API_KEY" : provider === "anthropic" ? "ANTHROPIC_API_KEY" : "AI_GATEWAY_API_KEY"
    }, or AI_GATEWAY_API_KEY to route through the Vercel AI Gateway.`,
  );
}
