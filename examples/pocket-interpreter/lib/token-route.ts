import { cartesiaConfigured, mintBrowserToken } from "./cartesia";
import { clientIp, createRateLimiter, tooManyRequests } from "./rate-limit";

const headers = { "Cache-Control": "no-store" };

export function createTokenRoute(
  allow = createRateLimiter(10, 60_000),
  mint: () => Promise<string> = () => mintBrowserToken(),
) {
  return async function POST(req: Request): Promise<Response> {
    if (!cartesiaConfigured()) {
      return Response.json({ error: "CARTESIA_API_KEY is not set. Add it to .env.local and restart." }, { status: 503, headers });
    }
    if (!allow(clientIp(req))) return tooManyRequests(headers);
    try {
      return Response.json({ token: await mint() }, { headers });
    } catch (err) {
      console.error("token mint failed", (err as Error).message);
      return Response.json({ error: "Could not get a Cartesia token. Check the API key." }, { status: 502, headers });
    }
  };
}
