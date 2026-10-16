import Cartesia from "@cartesia/cartesia-js";
import { languageCode, SAMPLE_RATE, TTS_MODEL, type Options } from "./config";
import { cartesiaApiKey, voiceIds } from "./env";
import type { ScriptLine } from "./types";
import { concatPcm, toWav } from "./wav";

async function speakLine(client: Cartesia, text: string, voiceId: string, o: Pick<Options, "outputLanguage">, signal?: AbortSignal) {
  const res = await client.tts.generate(
    {
      model_id: TTS_MODEL,
      transcript: text,
      voice: { mode: "id", id: voiceId },
      language: languageCode(o),
      output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: SAMPLE_RATE },
    },
    { signal },
  );
  return new Uint8Array(await res.arrayBuffer());
}

export const LINES_AT_ONCE = 4;
const GAP_SPEAKER_CHANGE_MS = 350;
const GAP_SAME_SPEAKER_MS = 180;

export type Episode = { wav: Uint8Array; starts: number[]; duration: number };

export async function renderEpisode(lines: ScriptLine[], o: Pick<Options, "outputLanguage">, signal?: AbortSignal): Promise<Episode> {
  const client = new Cartesia({ apiKey: cartesiaApiKey(), maxRetries: 2, timeout: 60_000 });
  const voices = voiceIds();
  const parts: Uint8Array[] = [];
  for (let i = 0; i < lines.length; i += LINES_AT_ONCE) {
    const batch = lines.slice(i, i + LINES_AT_ONCE);
    parts.push(...(await Promise.all(batch.map((line) => speakLine(client, line.text, voices[line.speaker], o, signal)))));
  }
  const gaps = lines.map((l, i) => (i === 0 ? 0 : l.speaker !== lines[i - 1].speaker ? GAP_SPEAKER_CHANGE_MS : GAP_SAME_SPEAKER_MS));
  const { pcm, starts, duration } = concatPcm(parts, gaps);
  return { wav: toWav(pcm), starts, duration };
}
