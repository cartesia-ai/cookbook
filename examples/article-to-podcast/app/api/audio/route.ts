import { z } from "zod";
import { defaultOptions, MAX_TRANSCRIPT_CHARS, OptionsSchema } from "../../../lib/config";
import { badRequest, errorResponse, streamChunks } from "../../../lib/http";
import { ScriptSchema } from "../../../lib/script";
import { createClient, renderEpisode } from "../../../lib/tts";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({ script: ScriptSchema, options: OptionsSchema.optional() });

export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Send a script with speaker and text for each line.");
  const { script, options = defaultOptions() } = parsed.data;
  const chars = script.lines.reduce((n, l) => n + l.text.length, 0);
  if (chars > MAX_TRANSCRIPT_CHARS) return badRequest("That script is too long to record.");
  try {
    const client = createClient();
    const { wav, starts } = await renderEpisode(script.lines, options, { client, signal: req.signal });
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
