import { getCartesia } from "@/lib/server/cartesia";
import { cartesiaError } from "@/lib/server/errors";

export type VoiceOption = { id: string; name: string; tagline: string };

export async function GET() {
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
