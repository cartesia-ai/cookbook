"use client";

import type Cartesia from "@cartesia/cartesia-js";

const CHUNK_MS = 100;

async function startMic(ctx: AudioContext, onChunk: (chunk: ArrayBuffer) => void) {
  const worklet = `
    class PCMCapture extends AudioWorkletProcessor {
      process(inputs) { const ch = inputs[0]?.[0]; if (ch) this.port.postMessage(ch); return true; }
    }
    registerProcessor('story-pcm-capture', PCMCapture);`;
  if (!registered.has(ctx)) {
    const url = URL.createObjectURL(new Blob([worklet], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    registered.add(ctx);
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  let source: MediaStreamAudioSourceNode;
  let node: AudioWorkletNode;
  try {
    source = ctx.createMediaStreamSource(stream);
    node = new AudioWorkletNode(ctx, "story-pcm-capture");
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw err;
  }
  const size = Math.round((ctx.sampleRate * CHUNK_MS) / 1000);
  let pending = new Float32Array(0);
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const joined = new Float32Array(pending.length + e.data.length);
    joined.set(pending);
    joined.set(e.data, pending.length);
    let at = 0;
    while (joined.length - at >= size) {
      onChunk(joined.slice(at, at + size).buffer);
      at += size;
    }
    pending = joined.slice(at);
  };
  source.connect(node);
  return () => {
    source.disconnect();
    node.disconnect();
    stream.getTracks().forEach((t) => t.stop());
  };
}
const registered = new WeakSet<AudioContext>();

export interface ListenHandlers {
  onPartial(transcript: string): void;
  onAnswer(transcript: string, final: boolean): boolean;
  onClosed?(): void;
}

export async function listenForChoice(client: Cartesia, ctx: AudioContext, handlers: ListenHandlers) {
  const ws = client.stt.autoFinalize.websocket({ model: "ink-2", encoding: "pcm_f32le", sample_rate: ctx.sampleRate });
  ws.on("error", (err) => console.error(err.message));
  let stopMic: (() => void) | null = null;
  let closed = false;
  const stop = () => {
    if (closed) return;
    closed = true;
    stopMic?.();
    try {
      ws.send({ type: "close" });
    } catch {}
  };
  try {
    stopMic = await startMic(ctx, (chunk) => !closed && ws.sendRaw(chunk));
  } catch (err) {
    closed = true;
    try {
      ws.close();
    } catch {}
    throw err;
  }
  if (closed) {
    stopMic();
    return { stop };
  }

  void (async () => {
    try {
      for await (const event of ws.stream()) {
        if (closed) break;
        if (event.type !== "message") continue;
        const m = event.message;
        if (m.type === "turn.update") handlers.onPartial(m.transcript);
        else if (m.type === "turn.eager_end" || m.type === "turn.end") {
          if (handlers.onAnswer(m.transcript, m.type === "turn.end")) stop();
        }
      }
    } catch (err) {
      console.error(err);
    }
    if (closed) return;
    stop();
    handlers.onClosed?.();
  })();

  return { stop };
}
