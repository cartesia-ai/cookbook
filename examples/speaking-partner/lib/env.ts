import { llmConfigured } from "./model";

export function getApiKey(): string | undefined {
  return process.env.CARTESIA_API_KEY || undefined;
}

export function hasCorrectionsKey(env: Record<string, string | undefined> = process.env): boolean {
  return llmConfigured(env);
}
