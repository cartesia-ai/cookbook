import type Cartesia from "@cartesia/cartesia-js";
import { startMic } from "./mic";

export interface ListenHandlers {
  onTurnStart(): void;
  onPartial(transcript: string): void;
  onTurnEnd(transcript: string): void;
}

export async function listen(client: Cartesia, audioCtx: AudioContext, handlers: ListenHandlers) {
  const ws = client.stt.autoFinalize.websocket({
    model: "ink-2",
    encoding: "pcm_f32le",
    sample_rate: audioCtx.sampleRate,
  });
  ws.on("error", (err) => console.error(err.message));

  const mic = await startMic(audioCtx, (chunk) => ws.sendRaw(chunk));

  const done = (async () => {
    for await (const event of ws.stream()) {
      if (event.type !== "message") continue;
      const m = event.message;
      if (m.type === "turn.start") handlers.onTurnStart();
      else if (m.type === "turn.update") handlers.onPartial(m.transcript);
      else if (m.type === "turn.end") handlers.onTurnEnd(m.transcript);
    }
  })();

  return {
    done,
    stop() {
      mic.stop();
      ws.send({ type: "close" });
    },
  };
}
