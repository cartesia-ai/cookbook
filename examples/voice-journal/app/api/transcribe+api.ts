import { getCartesia } from "@/lib/server/cartesia";
import { cartesiaError, json, rateLimited } from "@/lib/server/errors";
import { MAX_AUDIO_BYTES, STT_MODEL } from "@/lib/limits";
import { declaredTooLarge } from "@/lib/server/body";
import { createRateLimiter } from "@/lib/server/rate-limit";

const allow = createRateLimiter(10, 60_000);
const TOO_LARGE = "The recording is too large for the hosted limit (4 MB). Keep entries under four minutes.";

export async function POST(req: Request) {
  const limited = rateLimited(req, allow);
  if (limited) return limited;
  if (declaredTooLarge(req, MAX_AUDIO_BYTES + 64 * 1024)) return json({ error: TOO_LARGE }, 413);
  let form: { get(name: string): unknown };
  try {
    form = (await req.formData()) as unknown as typeof form;
  } catch {
    return json({ error: "Send the audio as multipart form data" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) return json({ error: "Missing audio file" }, 400);
  if (file.size === 0) return json({ error: "The recording is empty" }, 400);
  if (file.size > MAX_AUDIO_BYTES) return json({ error: TOO_LARGE }, 413);

  const name = file instanceof File && file.name ? file.name : "entry.m4a";
  try {
    const res = await getCartesia().stt.transcribe({
      file: new File([file], name, { type: file.type || "application/octet-stream" }),
      model: STT_MODEL,
      language: "en",
    });
    return json({ text: res.text.trim(), duration: res.duration ?? null });
  } catch (err) {
    return cartesiaError(err, "Transcription");
  }
}
