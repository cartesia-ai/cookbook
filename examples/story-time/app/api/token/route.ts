import { getCartesia, MissingKeyError } from "@/lib/cartesia";
import { clientIp, createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const allow = createRateLimiter(10, 60_000);

export async function POST(req: Request) {
  if (!allow(clientIp(req))) return tooManyRequests(headers);
  try {
    const { token } = await getCartesia().accessToken.create({ grants: { tts: true, stt: true }, expires_in: 60 });
    return Response.json({ token }, { headers });
  } catch (err) {
    if (err instanceof MissingKeyError) {
      return Response.json({ error: "CARTESIA_API_KEY is not set. Add it to .env.local and restart." }, { status: 503, headers });
    }
    return Response.json({ error: "Could not get a Cartesia token. Check CARTESIA_API_KEY." }, { status: 502, headers });
  }
}
