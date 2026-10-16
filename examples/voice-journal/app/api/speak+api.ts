import { getCartesia } from "@/lib/server/cartesia";
import { cartesiaError, json, rateLimited } from "@/lib/server/errors";
import { MAX_SPEAK_CHARS, TTS_MODEL } from "@/lib/limits";
import { createRateLimiter } from "@/lib/server/rate-limit";

const allow = createRateLimiter(10, 60_000);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const limited = rateLimited(req, allow);
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const voiceId = typeof body?.voiceId === "string" ? body.voiceId : "";
  if (!text) return json({ error: "Nothing to read" }, 400);
  if (text.length > MAX_SPEAK_CHARS) return json({ error: "The recap is too long to read in one request" }, 413);
  if (!UUID.test(voiceId)) return json({ error: "Pick a voice" }, 400);

  try {
    const res = await getCartesia().tts.generate({
      model_id: TTS_MODEL,
      transcript: text,
      voice: { mode: "id", id: voiceId },
      language: "en",
      output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
    });
    const audio = await res.arrayBuffer();
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (err) {
    return cartesiaError(err, "Speech");
  }
}
