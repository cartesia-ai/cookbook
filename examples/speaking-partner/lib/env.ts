export function getApiKey(): string | undefined {
  return process.env.CARTESIA_API_KEY || undefined;
}

export function hasCorrectionsKey(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
}

export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
