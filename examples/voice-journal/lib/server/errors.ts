import { Cartesia, MissingKeyError } from "./cartesia";
import { LlmConfigError } from "./llm";
import { clientIp, tooManyRequests } from "./rate-limit";

export function rateLimited(req: Request, allow: (key: string) => boolean): Response | null {
  return allow(clientIp(req)) ? null : tooManyRequests({ "Cache-Control": "no-store" });
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function cartesiaError(err: unknown, what: string): Response {
  if (err instanceof MissingKeyError) return json({ error: err.message }, 500);
  if (err instanceof Cartesia.APIError && typeof err.status === "number") {
    if (err.status === 401 || err.status === 403) return json({ error: "Cartesia rejected the API key" }, 502);
    if (err.status === 429) return json({ error: "Cartesia is rate limiting this account. Try again in a minute." }, 502);
    return json({ error: `${what} failed (Cartesia returned ${err.status})` }, 502);
  }
  return json({ error: `${what} failed` }, 500);
}

export function llmError(err: unknown, isNoOutput: boolean): Response {
  if (err instanceof LlmConfigError) return json({ error: err.message }, 500);
  if (isNoOutput) return json({ error: "The model did not return a valid answer" }, 502);
  return json({ error: "The LLM call failed. Check LLM_MODEL and the provider key." }, 500);
}
