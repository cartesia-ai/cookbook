import WebSocket from "ws";
import { mintAgentToken } from "@/lib/agents-web/server";
import { buildAgentUrl, encodeAudioInput, encodeSessionCreate } from "@/lib/agents-web";
import { createAgentsApi, AGENTS_PATH, statusOf } from "../lib/agents-api";
import { isLanguageCode, LANGUAGE_CODES, type LanguageCode } from "../lib/languages";
import { createSessionAgent, deleteSessionAgent, pickVoiceId, sweepStaleAgents } from "../lib/session-agent";

const apiKey = process.env.CARTESIA_API_KEY;
if (!apiKey) {
  console.log("CARTESIA_API_KEY is not set, live check not run");
  process.exit(0);
}
const secrets = [apiKey];
const log = (...a: unknown[]) =>
  console.log(secrets.reduce((s, v) => s.split(v).join("[redacted]"), a.join(" ")).replace(/access_token=[^&\s"']*/g, "access_token=[redacted]"));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Sock {
  ws: WebSocket;
  events: { type: string; [k: string]: unknown }[];
  closed: number | null;
}

function open(url: string): Promise<Sock> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const s: Sock = { ws, events: [], closed: null };
    ws.on("message", (d) => {
      try {
        s.events.push(JSON.parse(d.toString()));
      } catch {
        s.events.push({ type: "unparsable" });
      }
    });
    ws.on("close", (c) => (s.closed = c));
    ws.on("open", () => resolve(s));
    ws.on("error", () => setTimeout(() => resolve(s), 50));
  });
}

async function until(pred: () => boolean, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end && !pred()) await sleep(25);
  return pred();
}

const requested = process.argv.slice(2).filter(isLanguageCode);
const langs: LanguageCode[] = requested.length ? requested : [...LANGUAGE_CODES];
const api = createAgentsApi(apiKey);
let failures = 0;
const created: string[] = [];

async function checkLanguage(target: LanguageCode) {
  const native: LanguageCode = target === "en" ? "es" : "en";
  const voice = await pickVoiceId(api, target);
  const t0 = Date.now();
  const agentId = await createSessionAgent(api, { target, native, mode: "teacher", missionId: 5 });
  created.push(agentId);
  const createMs = Date.now() - t0;

  const { token } = await mintAgentToken({ apiKey: apiKey! });
  secrets.push(token);
  const s = await open(buildAgentUrl({ agentId, accessToken: token }));
  if (s.ws.readyState !== WebSocket.OPEN) throw new Error(`socket did not open (${s.closed})`);
  s.ws.send(encodeSessionCreate({ inputFormat: "pcm_16000", outputDelivery: "as_available" }));
  if (!(await until(() => s.events.some((e) => e.type === "session_ready"), 10_000))) throw new Error("no session_ready in 10 s");
  const silence = new Int16Array(640);
  for (let i = 0; i < 25; i++) {
    s.ws.send(encodeAudioInput(silence));
    await sleep(40);
  }
  const errors = s.events.filter((e) => e.type === "error");
  s.ws.close(1000);
  await sleep(100);
  const deleted = await deleteSessionAgent(api, agentId);
  created.splice(created.indexOf(agentId), 1);
  let gone = false;
  try {
    await api.get(`${AGENTS_PATH}/${agentId}`);
  } catch (err) {
    gone = statusOf(err) === 404;
  }
  if (errors.length || !gone) throw new Error(`errors=${JSON.stringify(errors)} gone=${gone}`);
  log(`ok  ${target}  voice=${voice}  create=${createMs}ms  session_ready  delete=${deleted}`);
}

async function probeDynamicVariables() {
  const agentId = await createSessionAgent(api, { target: "fr", native: "en", mode: "immersive", missionId: 0 });
  created.push(agentId);
  try {
    const { token } = await mintAgentToken({ apiKey: apiKey! });
    secrets.push(token);
    const s = await open(buildAgentUrl({ agentId, accessToken: token }));
    const msg = JSON.parse(encodeSessionCreate({ inputFormat: "pcm_16000" }));
    msg.dynamic_variables = { mission_title: "x" };
    s.ws.send(JSON.stringify(msg));
    await until(() => s.events.some((e) => e.type === "error"), 5000);
    const err = s.events.find((e) => e.type === "error");
    log(`browser token + dynamic_variables -> ${err ? String(err.code) : "no error (the limit may have changed)"}`);
    s.ws.close();
  } finally {
    await deleteSessionAgent(api, agentId);
    created.splice(created.indexOf(agentId), 1);
  }
}

try {
  for (const l of langs) {
    try {
      await checkLanguage(l);
    } catch (err) {
      failures++;
      log(`FAIL ${l}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  try {
    await probeDynamicVariables();
  } catch (err) {
    log(`probe failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  log(`swept ${await sweepStaleAgents(api)} stale session agents`);
} finally {
  for (const id of created) {
    try {
      await deleteSessionAgent(api, id);
      log(`cleaned up ${id}`);
    } catch {
      log(`could not clean up ${id}`);
    }
  }
}
process.exit(failures ? 1 : 0);
