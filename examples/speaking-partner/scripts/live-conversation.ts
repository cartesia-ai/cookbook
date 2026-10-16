import Cartesia from "@cartesia/cartesia-js";
import WebSocket from "ws";
import { mintAgentToken } from "@/lib/agents-web/server";
import { buildAgentUrl, encodeAudioInput, encodeSessionCreate } from "@/lib/agents-web";
import { createAgentsApi } from "../lib/agents-api";
import { isLanguageCode, type LanguageCode } from "../lib/languages";
import type { Mode } from "../lib/modes";
import { createSessionAgent, deleteSessionAgent, pickVoiceId } from "../lib/session-agent";

const apiKey = process.env.CARTESIA_API_KEY;
if (!apiKey) {
  console.log("CARTESIA_API_KEY is not set, conversation not run");
  process.exit(0);
}
const target = process.argv[2];
if (!isLanguageCode(target)) {
  console.log("usage: pnpm live:talk <en|es|fr|hi|ja>");
  process.exit(1);
}

const client = new Cartesia({ apiKey });
const api = createAgentsApi(apiKey);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const silence = () => new Int16Array(640);

interface Line {
  text: string;
  lang: LanguageCode;
}
interface Script {
  mode: Mode;
  missionId: number;
  native: LanguageCode;
  lines: Line[];
}

const SCRIPTS: Record<LanguageCode, Script> = {
  en: { mode: "teacher", missionId: 5, native: "es", lines: [{ text: "Hello, I would like a coffee and a croissant, please.", lang: "en" }] },
  es: {
    mode: "teacher",
    missionId: 5,
    native: "en",
    lines: [
      { text: "Hola, quisiera un café y un croissant, por favor.", lang: "es" },
      { text: "How do you say, the bill please?", lang: "en" },
    ],
  },
  fr: {
    mode: "immersive",
    missionId: 5,
    native: "en",
    lines: [
      { text: "Bonjour, je voudrais un café, s'il vous plaît.", lang: "fr" },
      { text: "Can you repeat that, please?", lang: "en" },
    ],
  },
  ja: { mode: "teacher", missionId: 0, native: "en", lines: [{ text: "こんにちは、はじめまして。げんきですか。", lang: "ja" }] },
  hi: { mode: "teacher", missionId: 0, native: "en", lines: [{ text: "नमस्ते, आप कैसे हैं?", lang: "hi" }] },
};

async function synthesize(text: string, lang: LanguageCode): Promise<Int16Array> {
  const voice = await pickVoiceId(api, lang, {});
  const res = await client.tts.generate({
    model_id: "sonic-3.6",
    transcript: text,
    voice: { mode: "id", id: voice } as never,
    language: lang,
    output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: 16000 },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
}

type Ev = { type: string; role?: string; text?: string; tool_name?: string; parameters?: unknown; code?: string; audio?: string };

async function main(script: Script) {
  const agentId = await createSessionAgent(api, { target: target as LanguageCode, native: script.native, mode: script.mode, missionId: script.missionId });
  try {
    const { token } = await mintAgentToken({ apiKey: apiKey! });
    const ws = new WebSocket(buildAgentUrl({ agentId, accessToken: token }));
    const events: Ev[] = [];
    ws.on("message", (d) => events.push(JSON.parse(d.toString()) as Ev));
    await new Promise((r) => ws.on("open", r));
    ws.send(encodeSessionCreate({ inputFormat: "pcm_16000", outputDelivery: "as_available" }));
    while (!events.some((e) => e.type === "session_ready")) await sleep(50);
    console.log(`${script.mode} mode, ${script.native} speaker learning ${target}`);

    let seen = 0;
    for (const line of script.lines) {
      const pcm = await synthesize(line.text, line.lang);
      for (let i = 0; i < pcm.length; i += 640) {
        ws.send(encodeAudioInput(pcm.subarray(i, i + 640)));
        await sleep(40);
      }
      const start = Date.now();
      while (Date.now() - start < 25_000 && !events.slice(seen).some((e) => e.type === "turn_ended" && e.role === "assistant")) {
        ws.send(encodeAudioInput(silence()));
        await sleep(40);
      }
      for (const e of events.slice(seen)) {
        if (e.type === "turn_ended") console.log(`  ${e.role}: ${e.text || "(no text)"}`);
        if (e.type === "client_tool_call") console.log(`  tool call ${e.tool_name} ${JSON.stringify(e.parameters)}`);
        if (e.type === "error") console.log(`  error ${e.code}`);
      }
      seen = events.length;
    }
    ws.close(1000);
  } finally {
    await deleteSessionAgent(api, agentId);
  }
}

await main(SCRIPTS[target]);
