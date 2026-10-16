import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { ConfigError } from "./env";

type Env = Record<string, string | undefined>;

export type ModelChoice = { provider: "gateway" | "anthropic" | "openai"; id: string };

export function chooseModel(env: Env = process.env): ModelChoice {
  const id = env.LLM_MODEL?.trim();
  if (!id || !id.includes("/")) {
    throw new ConfigError("Set LLM_MODEL in .env.local as provider/model, for example openai/gpt-5.4-mini.");
  }
  const slash = id.indexOf("/");
  const provider = id.slice(0, slash);
  const bare = id.slice(slash + 1);

  if (provider === "openai" && env.OPENAI_API_KEY) return { provider: "openai", id: bare };
  if (provider === "anthropic" && env.ANTHROPIC_API_KEY) return { provider: "anthropic", id: bare };
  if (env.AI_GATEWAY_API_KEY || env.VERCEL) return { provider: "gateway", id };

  throw new ConfigError(
    `No key for "${provider}". Set ${
      provider === "openai" ? "OPENAI_API_KEY" : provider === "anthropic" ? "ANTHROPIC_API_KEY" : "AI_GATEWAY_API_KEY"
    }, or AI_GATEWAY_API_KEY to route through the Vercel AI Gateway.`,
  );
}

export function getModel(env: Env = process.env): LanguageModel {
  const { provider, id } = chooseModel(env);
  if (provider === "openai") return createOpenAI({ apiKey: env.OPENAI_API_KEY })(id);
  if (provider === "anthropic") return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(id);
  return id;
}
