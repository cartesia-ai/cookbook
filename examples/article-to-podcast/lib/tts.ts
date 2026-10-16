import Cartesia from "@cartesia/cartesia-js";
import { languageCode, SAMPLE_RATE, TTS_MODEL, type Options } from "./config";
import { cartesiaApiKey, voiceIds } from "./env";
import type { ScriptLine, Speaker } from "./types";
import { concatPcm, toWav } from "./wav";

export const CONCURRENCY = 4;
const GAP_SPEAKER_CHANGE_MS = 350;
const GAP_SAME_SPEAKER_MS = 180;

export type TtsClient = { tts: { generate(body: Record<string, unknown>, options?: { signal?: AbortSignal }): PromiseLike<Response> } };

export class RenderError extends Error {
  constructor(readonly lineIndex: number, readonly status?: number) {
    super(`Recording failed on line ${lineIndex + 1}${status ? ` (HTTP ${status})` : ""}.`);
    this.name = "RenderError";
  }
}

export function createClient(env: Record<string, string | undefined> = process.env): TtsClient {
  return new Cartesia({ apiKey: cartesiaApiKey(env), maxRetries: 2, timeout: 60_000 }) as unknown as TtsClient;
}

async function pool<T, R>(items: T[], limit: number, signal: AbortSignal | undefined, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failure: unknown;
  let failed = false;
  async function worker() {
    while (!failed && !signal?.aborted) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        if (!failed) {
          failed = true;
          failure = err;
        }
        return;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failed) throw failure;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return results;
}

export async function renderLine(
  client: TtsClient,
  line: ScriptLine,
  o: Pick<Options, "outputLanguage">,
  voices: Record<Speaker, string>,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const res = await client.tts.generate(
    {
      model_id: TTS_MODEL,
      transcript: line.text,
      voice: { mode: "id", id: voices[line.speaker] },
      language: languageCode(o),
      output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: SAMPLE_RATE },
    },
    { signal },
  );
  return new Uint8Array(await res.arrayBuffer());
}

export type Episode = { wav: Uint8Array; starts: number[]; duration: number };

export async function renderEpisode(
  lines: ScriptLine[],
  o: Pick<Options, "outputLanguage">,
  opts: { client: TtsClient; voices?: Record<Speaker, string>; signal?: AbortSignal },
): Promise<Episode> {
  const voices = opts.voices ?? voiceIds();
  const parts = await pool(lines, CONCURRENCY, opts.signal, async (line, i) => {
    try {
      return await renderLine(opts.client, line, o, voices, opts.signal);
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      const status = (err as { status?: number })?.status;
      throw new RenderError(i, typeof status === "number" ? status : undefined);
    }
  });
  const gaps = lines.map((l, i) => (i === 0 ? 0 : l.speaker !== lines[i - 1].speaker ? GAP_SPEAKER_CHANGE_MS : GAP_SAME_SPEAKER_MS));
  const { pcm, starts, duration } = concatPcm(parts, gaps);
  return { wav: toWav(pcm), starts, duration };
}
