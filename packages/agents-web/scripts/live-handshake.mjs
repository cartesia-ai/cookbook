import Cartesia from '@cartesia/cartesia-js';
import WebSocket from 'ws';
import { mintAgentToken } from '../src/server.ts';
import { buildAgentUrl, encodeAudioInput, encodeSessionCreate } from '../src/protocol.ts';

const apiKey = process.env.CARTESIA_API_KEY;
if (!apiKey) {
  console.log('CARTESIA_API_KEY is not set, handshake not run');
  process.exit(0);
}

const secrets = [apiKey];
const redact = (s) => secrets.reduce((acc, v) => (v ? acc.split(v).join('[redacted]') : acc), String(s))
  .replace(/access_token=[^&\s"']*/g, 'access_token=[redacted]');
const log = (...a) => console.log(...a.map(redact));

async function resolveAgent() {
  const client = new Cartesia({ apiKey });
  if (process.env.CARTESIA_AGENT_ID) return { id: process.env.CARTESIA_AGENT_ID, name: '(from CARTESIA_AGENT_ID)' };
  const res = await client.agents.list();
  const list = Array.isArray(res) ? res : (res.summaries ?? res.data ?? []);
  const first = list[0];
  return first ? { id: first.id, name: first.name ?? '(unnamed)' } : null;
}

function open(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const state = { ws, events: [], closed: null, error: null };
    ws.on('message', (d) => {
      try { state.events.push(JSON.parse(d.toString())); } catch { state.events.push({ type: 'unparsable' }); }
    });
    ws.on('error', (e) => { state.error = e; });
    ws.on('close', (code) => { state.closed = code; });
    ws.on('open', () => resolve(state));
    ws.on('unexpected-response', (_req, res) => { state.closed = res.statusCode; resolve(state); });
    ws.on('error', () => setTimeout(() => resolve(state), 0));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(pred, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await sleep(25);
  }
  return pred();
}

async function main() {
  const agent = await resolveAgent();
  if (!agent) {
    console.log('no agent available, handshake not run');
    return 0;
  }
  log(`agent: ${agent.id} (${agent.name})`);

  const { token, expiresIn } = await mintAgentToken({ apiKey });
  secrets.push(token);
  log(`minted a token, expires in ${expiresIn}s`);

  const url = buildAgentUrl({ agentId: agent.id, accessToken: token });
  const s = await open(url);
  if (s.ws.readyState !== WebSocket.OPEN) throw new Error(`socket did not open (${s.closed ?? s.error?.message})`);
  s.ws.send(encodeSessionCreate({ inputFormat: 'pcm_16000', outputDelivery: 'as_available' }));
  const gotReady = await until(() => s.events.some((e) => e.type === 'session_ready'), 10000);
  if (!gotReady) throw new Error('no session_ready within 10s');
  const ready = s.events.find((e) => e.type === 'session_ready');
  log(`session_ready call_id=${ready.call_id} agent_version_id=${ready.agent_version_id} audio=${JSON.stringify(ready.audio)}`);

  const silence = new Int16Array(640);
  for (let i = 0; i < 25; i++) {
    s.ws.send(encodeAudioInput(silence));
    await sleep(40);
  }
  await sleep(2000);
  const errors = s.events.filter((e) => e.type === 'error');
  const audioBytes = s.events.filter((e) => e.type === 'audio_output').reduce((n, e) => n + Buffer.from(e.audio, 'base64').length, 0);
  const types = [...new Set(s.events.map((e) => e.type))];
  log(`events seen: ${types.join(', ')}; audio_output bytes: ${audioBytes}`);
  if (errors.length) throw new Error(`server error: ${errors[0].code} ${errors[0].message}`);

  s.ws.close(1000, 'session completed');
  const closed = await until(() => s.closed !== null, 5000);
  if (!closed) throw new Error('no close event after close(1000)');
  log(`closed with code ${s.closed}`);
  if (s.closed !== 1000) throw new Error(`unclean close ${s.closed}`);

  const bad = await open(buildAgentUrl({ agentId: agent.id, accessToken: 'not-a-real-token' }));
  if (bad.ws.readyState === WebSocket.OPEN) {
    bad.ws.send(encodeSessionCreate({ inputFormat: 'pcm_16000' }));
  }
  const ended = await until(() => bad.closed !== null || bad.error !== null, 10000);
  if (!ended) {
    bad.ws.terminate();
    throw new Error('garbage token: socket hung for 10s');
  }
  log(`garbage token: ended with ${bad.closed !== null ? `code ${bad.closed}` : 'a connection error'}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`FAILED: ${redact(err?.message ?? err)}`);
    process.exit(1);
  },
);
