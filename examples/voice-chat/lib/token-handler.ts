import { createAgentTokenHandler } from "@/lib/agents-web/server";
import { getApiKey } from "./env";
import { clientIp, createRateLimiter, tooManyRequests } from "./rate-limit";

const headers = { "Cache-Control": "no-store" };

export function createTokenRoute(allow = createRateLimiter(10, 60_000)) {
  return async function POST(req: Request): Promise<Response> {
    const apiKey = getApiKey();
    if (!apiKey) {
      return Response.json(
        { error: "CARTESIA_API_KEY is not set. Add it to .env.local and restart." },
        { status: 503, headers },
      );
    }
    if (!allow(clientIp(req))) return tooManyRequests(headers);
    const res = await createAgentTokenHandler({ apiKey, expiresIn: 60 })(req);
    if (!res.ok) {
      return Response.json({ error: "Could not get a Cartesia token. Check the API key." }, { status: 502, headers });
    }
    return res;
  };
}
