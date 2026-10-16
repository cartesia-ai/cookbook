export const MODERATION_MODEL = "omni-moderation-latest";
const ENDPOINT = "https://api.openai.com/v1/moderations";

export class ModerationError extends Error {}

export function moderationConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

export async function moderate(
  inputs: string[],
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean[] | null> {
  const key = env.OPENAI_API_KEY;
  if (!key) return null;
  let res: Response;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODERATION_MODEL, input: inputs }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ModerationError("moderation request failed");
  }
  if (!res.ok) throw new ModerationError(`moderation returned ${res.status}`);
  const body = (await res.json().catch(() => null)) as { results?: { flagged?: unknown }[] } | null;
  const results = body?.results;
  if (!Array.isArray(results) || results.length !== inputs.length) {
    throw new ModerationError("moderation returned an unexpected body");
  }
  return results.map((r) => r?.flagged === true);
}

export async function isFlagged(inputs: string[], env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  return (await moderate(inputs, env))?.some(Boolean) ?? false;
}
