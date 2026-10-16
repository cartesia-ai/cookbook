import { createAgentTokenHandler } from "@/lib/agents-web/server";
import { clientKey, getApiKey } from "../../../lib/env";
import { createRateLimiter } from "../../../lib/rate-limit";

const headers = { "Cache-Control": "no-store" };
const allow = createRateLimiter(12, 60_000);

export async function POST(req: Request): Promise<Response> {
  const apiKey = getApiKey();
  if (!apiKey) return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 503, headers });
  const res = await createAgentTokenHandler({ apiKey, expiresIn: 60, authorize: (r) => allow(clientKey(r)) })(req);
  if (res.status === 401) return Response.json({ error: "Too many requests. Try again in a minute." }, { status: 429, headers });
  return res;
}
