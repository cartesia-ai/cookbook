import type Cartesia from "@cartesia/cartesia-js";
import { startMic } from "./mic";

export interface ListenHandlers {
  onTurnStart(): void;
  onPartial(transcript: string): void;
  onEagerEnd(transcript: string): void;
  onResume(): void;
  onTurnEnd(transcript: string): void;
  onClosed(reason: string): void;
}

export async function listen(
  client: Cartesia,
  audioCtx: AudioContext,
  isMuted: () => boolean,
  handlers: ListenHandlers,
) {
  const ws = client.stt.autoFinalize.websocket({
    model: "ink-2",
    encoding: "pcm_f32le",
    sample_rate: audioCtx.sampleRate,
  });
  let stopped = false;
  ws.on("error", (err) => console.error(err.message));

  let mic: Awaited<ReturnType<typeof startMic>>;
  try {
    mic = await startMic(audioCtx, (chunk) => ws.sendRaw(chunk), isMuted);
  } catch (err) {
    try {
      ws.close();
    } catch {}
    throw err;
  }

  void (async () => {
    let reason = "closed";
    try {
      for await (const event of ws.stream()) {
        if (event.type === "close") {
          reason = `closed (${event.code})`;
          continue;
        }
        if (event.type !== "message") continue;
        const m = event.message;
        if (m.type === "turn.start") handlers.onTurnStart();
        else if (m.type === "turn.update") handlers.onPartial(m.transcript);
        else if (m.type === "turn.eager_end") handlers.onEagerEnd(m.transcript);
        else if (m.type === "turn.resume") handlers.onResume();
        else if (m.type === "turn.end") handlers.onTurnEnd(m.transcript);
        else if (m.type === "error") reason = m.message ?? "error";
      }
    } catch (err) {
      reason = (err as Error).message;
    }
    mic.stop();
    if (!stopped) handlers.onClosed(reason);
  })();

  return {
    stop() {
      stopped = true;
      mic.stop();
      try {
        ws.send({ type: "close" });
      } catch {}
    },
  };
}
