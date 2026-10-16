"use client";

import type Cartesia from "@cartesia/cartesia-js";
import { spokenText } from "@/lib/align";
import type { Line, SceneAudio, WordTiming } from "@/lib/story";

export const SAMPLE_RATE = 24000;
const GAP_SECONDS = 0.35;

export type Timeline = { lineStarts: number[]; words: WordTiming[][] };

export interface Narration {
  timeline: Timeline;
  recorded: Promise<SceneAudio | null>;
  ended: Promise<"done" | "stopped">;
  stop(): void;
}

function player(ctx: AudioContext) {
  const sources: AudioBufferSourceNode[] = [];
  let next = ctx.currentTime + 0.15;
  return {
    get next() {
      return next;
    },
    skip(seconds: number) {
      next += seconds;
    },
    play(samples: Float32Array) {
      const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
      buffer.getChannelData(0).set(samples);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      const at = Math.max(next, ctx.currentTime);
      src.start(at);
      next = at + buffer.duration;
      sources.push(src);
    },
    stop() {
      for (const s of sources) {
        try {
          s.stop();
        } catch {}
        s.disconnect();
      }
      sources.length = 0;
    },
  };
}

function waitUntil(ctx: AudioContext, at: () => number, stopped: Promise<void>): Promise<"done" | "stopped"> {
  return Promise.race([
    stopped.then(() => "stopped" as const),
    new Promise<"done">((resolve) => {
      const tick = () => (ctx.currentTime >= at() ? resolve("done") : setTimeout(tick, 100));
      tick();
    }),
  ]);
}

export function narrateLive(
  client: Cartesia,
  ctx: AudioContext,
  lines: Line[],
  voiceOf: (speaker: string) => string,
): Narration {
  const out = player(ctx);
  const timeline: Timeline = { lineStarts: [], words: [] };
  let stopFn = () => {};
  const stopped = new Promise<void>((r) => (stopFn = r));
  let isStopped = false;
  let generating = true;
  let cancel: (() => Promise<void>) | null = null;
  let close = () => {};

  const recorded = (async (): Promise<SceneAudio | null> => {
    const ws = await client.tts.websocket();
    close = () => ws.close();
    const pcm: Float32Array[] = [];
    let length = 0;
    const meta: SceneAudio["lines"] = [];
    try {
      for (const [i, line] of lines.entries()) {
        if (isStopped) return null;
        const c = ws.context({
          model_id: "sonic-3.6",
          voice: { mode: "id", id: voiceOf(line.speaker) },
          output_format: { container: "raw", encoding: "pcm_f32le", sample_rate: SAMPLE_RATE },
          language: "en",
          add_timestamps: true,
          use_normalized_timestamps: false,
        });
        cancel = () => c.cancel();
        await c.push({
          transcript: spokenText(line.text),
          ...(line.emotion === "neutral" ? {} : { generation_config: { emotion: line.emotion } }),
        });
        await c.no_more_inputs();

        const words: WordTiming[] = [];
        timeline.words[i] = words;
        meta.push({ offset: length / SAMPLE_RATE, words });
        let started = false;
        for await (const ev of c.receive()) {
          if (ev.type === "chunk" && ev.audio?.byteLength) {
            const samples = new Float32Array(ev.audio.slice().buffer);
            if (!started) {
              timeline.lineStarts[i] = Math.max(out.next, ctx.currentTime);
              started = true;
            }
            out.play(samples);
            pcm.push(samples);
            length += samples.length;
          } else if (ev.type === "timestamps" && ev.word_timestamps) {
            const w = ev.word_timestamps;
            w.words.forEach((word, k) => words.push({ word, start: w.start[k] ?? 0, end: w.end[k] ?? 0 }));
          } else if (ev.type === "error") {
            throw new Error(ev.message ?? ev.title ?? "Sonic returned an error");
          }
        }
        if (!started) timeline.lineStarts[i] = out.next;
        const gap = new Float32Array(Math.round(GAP_SECONDS * SAMPLE_RATE));
        pcm.push(gap);
        length += gap.length;
        out.skip(GAP_SECONDS);
      }
      const joined = new Float32Array(length);
      let at = 0;
      for (const p of pcm) {
        joined.set(p, at);
        at += p.length;
      }
      return { sampleRate: SAMPLE_RATE, pcm: joined.buffer, lines: meta };
    } finally {
      generating = false;
      cancel = null;
      ws.close();
    }
  })();

  const ended = recorded
    .then(() => waitUntil(ctx, () => out.next - GAP_SECONDS, stopped))
    .catch((err) => {
      if (isStopped) return "stopped" as const;
      throw err;
    });

  return {
    timeline,
    recorded: recorded.catch((err) => (isStopped ? null : Promise.reject(err))),
    ended,
    stop() {
      if (isStopped) return;
      isStopped = true;
      out.stop();
      if (generating) void cancel?.().catch(() => {});
      close();
      stopFn();
    },
  };
}

export function replay(ctx: AudioContext, audio: SceneAudio): Narration {
  const out = player(ctx);
  const start = out.next;
  out.play(new Float32Array(audio.pcm));
  let stopFn = () => {};
  const stopped = new Promise<void>((r) => (stopFn = r));
  return {
    timeline: { lineStarts: audio.lines.map((l) => start + l.offset), words: audio.lines.map((l) => l.words) },
    recorded: Promise.resolve(audio),
    ended: waitUntil(ctx, () => out.next - GAP_SECONDS, stopped),
    stop() {
      out.stop();
      stopFn();
    },
  };
}
