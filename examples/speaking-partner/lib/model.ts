import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5";
export const DEFAULT_OPENAI_MODEL = "gpt-5-mini";

type Env = Record<string, string | undefined>;

export function parseModelSpec(spec: string | undefined): { provider: "anthropic" | "openai"; id: string } | null {
  if (!spec) return null;
  const i = spec.indexOf(":");
  if (i < 1) return null;
  const provider = spec.slice(0, i);
  const id = spec.slice(i + 1).trim();
  if ((provider !== "anthropic" && provider !== "openai") || !id) return null;
  return { provider, id };
}

export function resolveModel(env: Env = process.env): { model: LanguageModel; label: string } | null {
  const spec = parseModelSpec(env.CORRECTIONS_MODEL);
  const wantAnthropic = spec ? spec.provider === "anthropic" : Boolean(env.ANTHROPIC_API_KEY);
  const wantOpenAI = spec ? spec.provider === "openai" : !env.ANTHROPIC_API_KEY && Boolean(env.OPENAI_API_KEY);
  if (wantAnthropic && env.ANTHROPIC_API_KEY) {
    const id = spec?.id ?? DEFAULT_ANTHROPIC_MODEL;
    return { model: createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(id), label: `anthropic:${id}` };
  }
  if (wantOpenAI && env.OPENAI_API_KEY) {
    const id = spec?.id ?? DEFAULT_OPENAI_MODEL;
    return { model: createOpenAI({ apiKey: env.OPENAI_API_KEY })(id), label: `openai:${id}` };
  }
  return null;
}
