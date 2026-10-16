import Cartesia from "@cartesia/cartesia-js";
import { getCartesia, MissingKeyError } from "@/lib/cartesia";
import { MAX_AUDIO_BYTES, normalizeLanguage } from "@/lib/limits";
import { clientIp, createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

const UPSTREAM_ERRORS: Record<number, string> = {
  400: "Cartesia could not read this audio. Try MP3, M4A, WAV, WebM or FLAC.",
  401: "The Cartesia API key was rejected. Check CARTESIA_API_KEY.",
  402: "The Cartesia account is out of credits.",
  413: "The audio file is too large for Cartesia.",
  429: "Cartesia is rate limiting this account. Try again in a minute.",
};

export const runtime = "nodejs";
export const maxDuration = 60;

const allow = createRateLimiter(10, 60_000);

export async function POST(req: Request) {
  if (!allow(clientIp(req))) return tooManyRequests();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Send the audio as multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing audio file" }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "The audio file is empty" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return Response.json(
      { error: "File too large for the hosted limit (4 MB). Run locally or see the README for large files." },
      { status: 413 },
    );
  }
  const language = normalizeLanguage(form.get("language"));

  try {
    const res = await getCartesia().stt.transcribe({ file, model: "ink-whisper", language });
    return Response.json({
      transcript: res.text,
      duration: res.duration ?? null,
      language: res.language ?? language,
    });
  } catch (err) {
    if (err instanceof MissingKeyError) {
      return Response.json({ error: err.message }, { status: 500 });
    }
    if (err instanceof Cartesia.APIError && typeof err.status === "number") {
      return Response.json({ error: UPSTREAM_ERRORS[err.status] ?? "Transcription failed" }, { status: 502 });
    }
    return Response.json({ error: "Transcription failed" }, { status: 500 });
  }
}
