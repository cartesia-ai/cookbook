import { DEFAULT_VOICES } from "./config";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function cartesiaApiKey(env: Record<string, string | undefined> = process.env): string {
  const key = env.CARTESIA_API_KEY?.trim();
  if (!key) throw new ConfigError("Set CARTESIA_API_KEY in .env.local to record audio.");
  return key;
}

export function voiceIds(env: Record<string, string | undefined> = process.env): { A: string; B: string } {
  return {
    A: env.CARTESIA_VOICE_HOST_A?.trim() || DEFAULT_VOICES.A,
    B: env.CARTESIA_VOICE_HOST_B?.trim() || DEFAULT_VOICES.B,
  };
}
