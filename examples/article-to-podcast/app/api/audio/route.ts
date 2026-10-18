import { z } from "zod";
import { defaultOptions, MAX_TRANSCRIPT_CHARS, OptionsSchema } from "@/lib/config";
import { badRequest, errorResponse, streamChunks } from "@/lib/http";
import { clientIp, createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { ScriptSchema } from "@/lib/script";
import { renderEpisode } from "@/lib/tts";

export const runtime = "nodejs";
export const maxDuration = 300;

const allow = createRateLimiter(5, 60_000);

const Body = z.object({ script: ScriptSchema, options: OptionsSchema.optional() });

export async function POST(req: Request): Promise<Response> {
  if (!allow(clientIp(req))) return tooManyRequests();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Send a script with speaker and text for each line.");
  const { script, options = defaultOptions() } = parsed.data;
  const chars = script.lines.reduce((n, l) => n + l.text.length, 0);
  if (chars > MAX_TRANSCRIPT_CHARS) return badRequest("That script is too long to record.");
  try {
    const { wav, starts } = await renderEpisode(script.lines, options, req.signal);
    return new Response(streamChunks(wav), {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(wav.byteLength),
        "X-Line-Starts": JSON.stringify(starts.map((s) => Math.round(s * 1000) / 1000)),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
