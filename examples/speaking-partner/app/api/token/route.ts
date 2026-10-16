import { createAgentTokenHandler } from "@/lib/agents-web/server";
import { getApiKey } from "../../../lib/env";
import { clientIp, createRateLimiter, tooManyRequests } from "../../../lib/rate-limit";

const headers = { "Cache-Control": "no-store" };
const allow = createRateLimiter(10, 60_000);

export async function POST(req: Request): Promise<Response> {
  const apiKey = getApiKey();
  if (!apiKey) return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 503, headers });
  if (!allow(clientIp(req))) return tooManyRequests(headers);
  const res = await createAgentTokenHandler({ apiKey, expiresIn: 60 })(req);
  if (!res.ok) {
    return Response.json({ error: "Could not get a Cartesia token. Check the API key." }, { status: 502, headers });
  }
  return res;
}
