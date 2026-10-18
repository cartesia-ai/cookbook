import { DEFAULT_VOICES } from "./config";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function cartesiaConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.CARTESIA_API_KEY?.trim());
}

export function cartesiaApiKey(env: Record<string, string | undefined> = process.env): string {
  const key = env.CARTESIA_API_KEY?.trim();
  if (!key) throw new ConfigError("CARTESIA_API_KEY is not set. Add it to .env.local and restart.");
  return key;
}

export function voiceIds(env: Record<string, string | undefined> = process.env): { A: string; B: string } {
  return {
    A: env.CARTESIA_VOICE_HOST_A?.trim() || DEFAULT_VOICES.A,
    B: env.CARTESIA_VOICE_HOST_B?.trim() || DEFAULT_VOICES.B,
  };
}
