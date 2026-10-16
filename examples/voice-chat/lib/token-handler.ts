import { createAgentTokenHandler } from "@/lib/agents-web/server";
import { getApiKey } from "./env";
import { createRateLimiter } from "./rate-limit";

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
    const handler = createAgentTokenHandler({
      apiKey,
      expiresIn: 60,
      authorize: (r) => allow(r.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"),
    });
    const res = await handler(req);
    if (res.status === 401) {
      return Response.json({ error: "Too many requests. Try again in a minute." }, { status: 429, headers });
    }
    return res;
  };
}
