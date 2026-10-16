import type Cartesia from "@cartesia/cartesia-js";

const SAMPLE_RATE = 44100;

export function takeSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let rest = buffer;
  for (;;) {
    const m = rest.match(/^([\s\S]*?[.!?])\s+/);
    if (!m) break;
    sentences.push(m[1]!);
    rest = rest.slice(m[0].length);
  }
  return { sentences, rest };
}

export interface Speaker {
  speak(text: AsyncIterable<string>, onWords?: (spoken: string) => void): Promise<void>;
  cancel(): Promise<string>;
  readonly speaking: boolean;
}

export async function createSpeaker(client: Cartesia, audioCtx: AudioContext, voice: string): Promise<Speaker> {
  const ws = await client.tts.websocket();
  ws.on("error", (err) => console.error(err.message));

  let ctx: ReturnType<typeof ws.context> | null = null;
  let sources: AudioBufferSourceNode[] = [];
  let nextStart = 0;
  let replyStart = 0;
  let words: { word: string; start: number }[] = [];
  let speaking = false;

  const spokenSoFar = () => {
    const t = audioCtx.currentTime - replyStart;
    return words.filter((w) => w.start <= t).map((w) => w.word).join(" ");
  };

  return {
    get speaking() {
      return speaking;
    },

    async speak(text, onWords) {
      const current = ws.context({
        model_id: "sonic-3.6",
        voice,
        output_format: { container: "raw", encoding: "pcm_f32le", sample_rate: SAMPLE_RATE },
        language: "en",
        add_timestamps: true,
        max_buffer_delay_ms: 0,
      });
      ctx = current;
      sources = [];
      words = [];
      speaking = true;
      nextStart = Math.max(nextStart, audioCtx.currentTime);
      replyStart = nextStart;

      const playing = (async () => {
        for await (const event of current.receive()) {
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
            sources.push(source);
          } else if (event.type === "timestamps" && event.word_timestamps) {
            const w = event.word_timestamps;
            w.words.forEach((word, i) => words.push({ word, start: w.start[i] ?? 0 }));
            onWords?.(spokenSoFar());
          } else if (event.type === "error") {
            console.error(event.title, event.message);
          }
        }
        speaking = false;
      })();

      let buffer = "";
      for await (const piece of text) {
        buffer += piece;
        const { sentences, rest } = takeSentences(buffer);
        buffer = rest;
        for (const transcript of sentences) await current.push({ transcript });
      }
      if (buffer.trim()) await current.push({ transcript: buffer });
      await current.no_more_inputs();
      await playing;
    },

    async cancel() {
      const spoken = spokenSoFar();
      await ctx?.cancel();
      for (const s of sources) {
        s.stop();
        s.disconnect();
      }
      sources = [];
      nextStart = audioCtx.currentTime;
      speaking = false;
      return spoken;
    },
  };
}
