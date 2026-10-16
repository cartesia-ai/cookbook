import { getCartesia } from "@/lib/server/cartesia";
import { cartesiaError, rateLimited } from "@/lib/server/errors";
import { createRateLimiter } from "@/lib/server/rate-limit";

const allow = createRateLimiter(20, 60_000);

export type VoiceOption = { id: string; name: string; tagline: string };

export async function GET(req: Request) {
  const limited = rateLimited(req, allow);
  if (limited) return limited;
  try {
    const page = await getCartesia().voices.list({ limit: 100, is_owner: false });
    const voices: VoiceOption[] = page.data
      .filter((v) => v.language === "en")
      .map((v) => ({ id: v.id, name: v.name, tagline: v.tagline ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return Response.json({ voices }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (err) {
    return cartesiaError(err, "Loading voices");
  }
}
