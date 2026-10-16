import Cartesia from "@cartesia/cartesia-js";
import { listen } from "./listen";
import { createSpeaker } from "./speak";

type Message = { role: "user" | "assistant"; content: string };

async function* readText(res: Response): AsyncGenerator<string> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}

export async function startVoiceChat(opts: {
  voice: string;
  onCaption(text: string): void;
  onMessages(messages: Message[]): void;
}) {
  const { token } = await (await fetch("/api/token", { method: "POST" })).json();
  const client = new Cartesia({ token });
  const audioCtx = new AudioContext();
  const speaker = await createSpeaker(client, audioCtx, opts.voice);

  const messages: Message[] = [];
  let llm: AbortController | null = null;

  const bargeIn = async () => {
    if (!speaker.speaking && !llm) return;
    llm?.abort();
    llm = null;
    const spoken = await speaker.cancel();
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") last.content = spoken;
    opts.onMessages([...messages]);
  };

  const listening = await listen(client, audioCtx, {
    onTurnStart: () => void bargeIn(),
    onPartial: opts.onCaption,
    onTurnEnd: async (transcript) => {
      opts.onCaption("");
      messages.push({ role: "user", content: transcript });
      messages.push({ role: "assistant", content: "" });
      opts.onMessages([...messages]);

      const controller = new AbortController();
      llm = controller;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: messages.slice(0, -1) }),
          signal: controller.signal,
        });
        await speaker.speak(readText(res), (spoken) => {
          messages[messages.length - 1]!.content = spoken;
          opts.onMessages([...messages]);
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") throw err;
      } finally {
        if (llm === controller) llm = null;
      }
    },
  });

  return {
    async stop() {
      listening.stop();
      await bargeIn();
      await audioCtx.close();
    },
  };
}
