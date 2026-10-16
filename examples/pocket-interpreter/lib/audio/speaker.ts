import type Cartesia from "@cartesia/cartesia-js";
import type { Lang } from "../languages";
import { takeSentences } from "../translation";

const SAMPLE_RATE = 44100;
const TAIL_S = 0.35;

export interface Speaker {
  speak(
    text: AsyncIterable<string>,
    opts: { voice: string; language: Lang; onFirstAudio?: () => void },
  ): Promise<void>;
  busy(): boolean;
  open(): boolean;
  close(): void;
}

export async function createSpeaker(client: Cartesia, audioCtx: AudioContext): Promise<Speaker> {
  const ws = await client.tts.websocket();
  ws.on("error", (err) => console.error(err.message));

  let nextStart = 0;
  let active = 0;

  return {
    busy: () => active > 0 || audioCtx.currentTime < nextStart + TAIL_S,
    open: () => ws.socket.readyState === 1,
    close: () => ws.close(),

    async speak(text, { voice, language, onFirstAudio }) {
      active++;
      try {
        const ctx = ws.context({
          model_id: "sonic-3.6",
          voice: { mode: "id", id: voice },
          output_format: { container: "raw", encoding: "pcm_f32le", sample_rate: SAMPLE_RATE },
          language,
          max_buffer_delay_ms: 0,
        });
        let first = true;

        const playing = (async () => {
          for await (const event of ctx.receive()) {
            if (event.type === "chunk" && event.audio) {
              const floats = new Float32Array(event.audio.buffer, event.audio.byteOffset, event.audio.byteLength / 4);
              const buffer = audioCtx.createBuffer(1, floats.length, SAMPLE_RATE);
              buffer.getChannelData(0).set(floats);
              const source = audioCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(audioCtx.destination);
              const at = Math.max(nextStart, audioCtx.currentTime);
              source.start(at);
              nextStart = at + buffer.duration;
              if (first) {
                first = false;
                onFirstAudio?.();
              }
            } else if (event.type === "error") {
              throw new Error(event.message ?? "Speech failed");
            }
          }
        })();

        let buffer = "";
        let pushed = false;
        for await (const piece of text) {
          buffer += piece;
          const { sentences, rest } = takeSentences(buffer);
          buffer = rest;
          for (const transcript of sentences) {
            await ctx.push({ transcript: `${transcript} ` });
            pushed = true;
          }
        }
        if (buffer.trim()) {
          await ctx.push({ transcript: buffer.trim() });
          pushed = true;
        }
        if (!pushed) {
          await ctx.cancel();
          return;
        }
        await ctx.no_more_inputs();
        await playing;
        const left = nextStart - audioCtx.currentTime;
        if (left > 0) await new Promise((r) => setTimeout(r, left * 1000));
      } finally {
        active--;
      }
    },
  };
}
