import Cartesia from "@cartesia/cartesia-js";
import { listen } from "./audio/listener";
import { createSpeaker, type Speaker } from "./audio/speaker";
import { otherOf, VOICES, type Lang } from "./languages";
import { createReplyParser, guessByScript } from "./translation";

export type Phase = "connecting" | "listening" | "hearing" | "translating" | "speaking";

export interface Turn {
  id: number;
  from: Lang | null;
  to: Lang | null;
  source: string;
  translation: string;
  status: "translating" | "speaking" | "done" | "failed";
  latency: { translatedMs?: number; speakingMs?: number };
}

export interface InterpreterEvents {
  onTurns(turns: Turn[]): void;
  onCaption(text: string): void;
  onPhase(phase: Phase): void;
  onError(message: string): void;
}

export class StartError extends Error {}

async function fetchToken(): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/token", { method: "POST" });
  } catch {
    throw new StartError("Could not reach the server. Check that the dev server is running.");
  }
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !body.token) throw new StartError(body.error ?? "Could not get a Cartesia token.");
  return body.token;
}

function fetchTranslation(text: string, pair: readonly [Lang, Lang], signal: AbortSignal): Promise<Response> {
  return fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, pair }),
    signal,
  });
}

async function* readText(res: Response): AsyncGenerator<string> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}

export async function startInterpreter(pair: readonly [Lang, Lang], events: InterpreterEvents) {
  const audioCtx = new AudioContext();
  events.onPhase("connecting");

  let stopped = false;
  let client = new Cartesia({ token: await fetchToken() });
  let speaker: Speaker = await createSpeaker(client, audioCtx);

  const turns: Turn[] = [];
  let nextId = 1;
  let hearing = false;
  let queue: Promise<void> = Promise.resolve();
  const inflight = new Set<AbortController>();
  let early: { text: string; controller: AbortController; res: Promise<Response> } | null = null;

  const emit = () => events.onTurns(turns.map((t) => ({ ...t, latency: { ...t.latency } })));
  const phase = () => {
    if (turns.some((t) => t.status === "speaking")) return events.onPhase("speaking");
    if (turns.some((t) => t.status === "translating")) return events.onPhase("translating");
    events.onPhase(hearing ? "hearing" : "listening");
  };
  const update = () => {
    emit();
    phase();
  };

  const translate = (text: string) => {
    const controller = new AbortController();
    inflight.add(controller);
    const res = fetchTranslation(text, pair, controller.signal);
    res.catch(() => {}).finally(() => inflight.delete(controller));
    return { text, controller, res };
  };
  const dropEarly = () => {
    early?.controller.abort();
    early = null;
  };

  async function ensureSpeaker() {
    if (speaker.open()) return;
    client = new Cartesia({ token: await fetchToken() });
    speaker = await createSpeaker(client, audioCtx);
  }

  async function run(turn: Turn, endedAt: number, resPromise: Promise<Response>) {
    const res = await resPromise;
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Could not translate this turn.");
    }
    const parser = createReplyParser(pair);
    const it = readText(res)[Symbol.asyncIterator]();
    const mark = (t: string) => {
      if (!t) return;
      if (turn.latency.translatedMs === undefined) turn.latency.translatedMs = performance.now() - endedAt;
      turn.translation += t;
      emit();
    };

    let head = "";
    for (;;) {
      const { done, value } = await it.next();
      if (done) {
        head = parser.end();
        break;
      }
      head = parser.push(value);
      if (head || parser.lang) break;
    }
    const previous = turns.filter((t) => t.from && t.id !== turn.id).at(-1)?.from;
    const from = parser.lang ?? guessByScript(turn.source, pair) ?? (previous ? otherOf(pair, previous) : pair[0]);
    const to = otherOf(pair, from);
    turn.from = from;
    turn.to = to;
    mark(head);

    async function* rest(): AsyncGenerator<string> {
      if (head) yield head;
      for (;;) {
        const { done, value } = await it.next();
        if (done) {
          const tail = parser.end();
          mark(tail);
          if (tail) yield tail;
          return;
        }
        const t = parser.push(value);
        mark(t);
        if (t) yield t;
      }
    }

    await ensureSpeaker();
    await speaker.speak(rest(), {
      voice: VOICES[to].id,
      language: to,
      onFirstAudio: () => {
        turn.latency.speakingMs = performance.now() - endedAt;
        turn.status = "speaking";
        update();
      },
    });
    if (!turn.translation.trim()) throw new Error("The translation came back empty.");
  }

  const handlers = {
    onTurnStart() {
      hearing = true;
      phase();
    },
    onPartial(text: string) {
      events.onCaption(text);
    },
    onEagerEnd(text: string) {
      if (early?.text === text.trim()) return;
      dropEarly();
      if (text.trim()) early = translate(text.trim());
    },
    onResume() {
      dropEarly();
    },
    onTurnEnd(text: string) {
      const endedAt = performance.now();
      hearing = false;
      events.onCaption("");
      const source = text.trim();
      if (!source) {
        dropEarly();
        return phase();
      }
      const job = early?.text === source ? early : (dropEarly(), translate(source));
      early = null;

      const turn: Turn = { id: nextId++, from: null, to: null, source, translation: "", status: "translating", latency: {} };
      turns.push(turn);
      update();
      queue = queue.then(async () => {
        if (stopped) return;
        try {
          await run(turn, endedAt, job.res);
          turn.status = "done";
        } catch (err) {
          if (stopped || (err as Error).name === "AbortError") return;
          turn.status = "failed";
          console.error(err);
        }
        update();
      });
    },
    async onClosed(reason: string) {
      if (stopped) return;
      console.warn("Ink 2 socket", reason);
      try {
        client = new Cartesia({ token: await fetchToken() });
        listening = await listen(client, audioCtx, () => speaker.busy(), handlers);
      } catch {
        events.onError("The connection to Cartesia dropped. Start again.");
      }
    },
  };

  let listening: Awaited<ReturnType<typeof listen>>;
  try {
    listening = await listen(client, audioCtx, () => speaker.busy(), handlers);
  } catch (err) {
    speaker.close();
    await audioCtx.close();
    const name = (err as Error).name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new StartError("Allow microphone access for this site in the address bar, then try again.");
    }
    if (name === "NotFoundError") throw new StartError("No microphone was found.");
    throw err;
  }
  phase();

  return {
    async stop() {
      stopped = true;
      dropEarly();
      for (const c of inflight) c.abort();
      listening.stop();
      speaker.close();
      await audioCtx.close().catch(() => {});
    },
  };
}
