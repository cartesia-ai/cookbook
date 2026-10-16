import { clientKey } from "../../../lib/env";
import { CorrectRequestSchema, correctLine } from "../../../lib/corrections";
import { resolveModel } from "../../../lib/model";
import { createRateLimiter } from "../../../lib/rate-limit";

const headers = { "Cache-Control": "no-store" };
const allow = createRateLimiter(40, 60_000);

export async function POST(req: Request): Promise<Response> {
  const resolved = resolveModel();
  if (!resolved) {
    return Response.json({ error: "No corrections key is set.", code: "no_key" }, { status: 503, headers });
  }
  if (!allow(clientKey(req))) {
    return Response.json({ error: "Too many requests.", code: "rate_limited" }, { status: 429, headers });
  }
  const parsed = CorrectRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request.", code: "bad_request" }, { status: 400, headers });
  try {
    const correction = await correctLine(resolved.model, parsed.data, req.signal);
    return Response.json(correction, { headers });
  } catch (error) {
    console.error(`[correct] ${resolved.label} failed:`, error instanceof Error ? error.message : error);
    return Response.json({ error: "The check failed.", code: "upstream" }, { status: 502, headers });
  }
}
