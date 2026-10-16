import { cartesiaConfigured, mintBrowserToken } from "./cartesia";
import { createRateLimiter } from "./rate-limit";

const headers = { "Cache-Control": "no-store" };

export function createTokenRoute(
  allow = createRateLimiter(20, 60_000),
  mint: () => Promise<string> = () => mintBrowserToken(),
) {
  return async function POST(req: Request): Promise<Response> {
    if (!cartesiaConfigured()) {
      return Response.json({ error: "CARTESIA_API_KEY is not set. Add it to .env.local and restart." }, { status: 503, headers });
    }
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!allow(ip)) {
      return Response.json({ error: "Too many requests. Try again in a minute." }, { status: 429, headers });
    }
    try {
      return Response.json({ token: await mint() }, { headers });
    } catch (err) {
      console.error("token mint failed", (err as Error).message);
      return Response.json({ error: "Could not get a Cartesia token. Check the API key." }, { status: 502, headers });
    }
  };
}
