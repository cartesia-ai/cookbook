import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CartesiaAgentClient } from '../client';
import { CartesiaAgentError } from '../errors';
import { bytesToBase64 } from '../audio/pcm';
import { READY, makeHarness } from './fakes';

const flush = () => new Promise<void>((r) => setImmediate(r));
const b64 = (n: number) => bytesToBase64(new Uint8Array(n));

async function ready(over: Record<string, unknown> = {}) {
  const h = makeHarness(over);
  const client = new CartesiaAgentClient(h.options as never);
  const p = client.start();
  await flush();
  const ws = h.sockets[0]!;
  ws.open();
  ws.message(READY);
  await p;
  return { h, client, ws };
}

describe('start', () => {
  it('sends session_create first, with input_format', async () => {
    const h = makeHarness();
    const client = new CartesiaAgentClient(h.options as never);
    const p = client.start();
    await flush();
    const ws = h.sockets[0]!;
    expect(new URL(ws.url).searchParams.get('access_token')).toBe('tok_fake');
    expect(ws.sent).toHaveLength(0);
    ws.open();
    expect(ws.frames()[0]).toEqual({
      type: 'session_create',
      audio: { input_format: 'pcm_16000', output_delivery: 'as_available' },
    });
    ws.message(READY);
    await p;
    expect(client.status).toBe('ready');
    expect(client.callId).toBe('call_1');
  });

  it('does not send audio before session_ready, then does', async () => {
    const h = makeHarness();
    const client = new CartesiaAgentClient(h.options as never);
    const p = client.start();
    await flush();
    const ws = h.sockets[0]!;
    ws.open();
    h.mic(new Int16Array(640));
    expect(ws.frames().map((f) => f.type)).toEqual(['session_create']);
    ws.message(READY);
    await p;
    h.mic(new Int16Array(640));
    const f = ws.frames()[1];
    expect(f.type).toBe('audio_input');
    expect(atob(f.audio).length).toBe(1280);
  });

  it('rejects a second start while running', async () => {
    const { client } = await ready();
    await expect(client.start()).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('rejects and opens no socket when getToken fails', async () => {
    const h = makeHarness({ getToken: async () => { throw new Error('nope'); } });
    const client = new CartesiaAgentClient(h.options as never);
    await expect(client.start()).rejects.toMatchObject({ code: 'token_failed' });
    expect(h.sockets).toHaveLength(0);
    expect(h.capture.stopped).toBe(true);
    expect(h.ctx.closed).toBe(true);
    expect(client.status).toBe('error');
  });

  it('rejects with mic_denied and leaves nothing open', async () => {
    const h = makeHarness({
      captureFactory: async () => {
        throw new CartesiaAgentError('mic_denied', 'denied');
      },
    });
    const client = new CartesiaAgentClient(h.options as never);
    await expect(client.start()).rejects.toMatchObject({ code: 'mic_denied' });
    expect(h.sockets).toHaveLength(0);
    expect(h.ctx.closed).toBe(true);
  });

  it('strips the token from error messages', async () => {
    const h = makeHarness({
      webSocketFactory: (url: string) => {
        throw new Error(`bad url ${url}`);
      },
    });
    const client = new CartesiaAgentClient(h.options as never);
    const err = await client.start().catch((e) => e);
    expect(String(err.message)).not.toContain('tok_fake');
  });

  describe('timeouts', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('rejects and closes the socket when session_ready never comes', async () => {
      const h = makeHarness({ connectTimeoutMs: 5000 });
      const client = new CartesiaAgentClient(h.options as never);
      const p = client.start().catch((e) => e);
      await vi.advanceTimersByTimeAsync(10);
      h.sockets[0]!.open();
      await vi.advanceTimersByTimeAsync(5000);
      const err = await p;
      expect(err.code).toBe('connect_timeout');
      expect(h.sockets[0]!.closedWith?.code).toBe(1000);
      expect(h.capture.stopped).toBe(true);
    });

    it('stop() resolves even if the server never echoes the close', async () => {
      const h = makeHarness();
      const client = new CartesiaAgentClient(h.options as never);
      const p = client.start();
      await vi.advanceTimersByTimeAsync(10);
      h.sockets[0]!.open();
      h.sockets[0]!.message(READY);
      await p;
      const closes: number[] = [];
      client.on('close', (e) => closes.push(e.code));
      const stopped = client.stop();
      expect(h.sockets[0]!.closedWith?.code).toBe(1000);
      await vi.advanceTimersByTimeAsync(1000);
      await stopped;
      expect(client.status).toBe('closed');
      expect(h.capture.stopped).toBe(true);
      expect(h.ctx.closed).toBe(true);
      expect(closes).toEqual([1000]);
      await client.stop();
    });

    it('arms a fallback close after a fatal error', async () => {
      const h = makeHarness();
      const client = new CartesiaAgentClient(h.options as never);
      const p = client.start();
      await vi.advanceTimersByTimeAsync(10);
      const ws = h.sockets[0]!;
      ws.open();
      ws.message(READY);
      await p;
      ws.message({ type: 'error', code: 'agent_failed', message: 'x', fatal: true });
      expect(client.status).toBe('ready');
      await vi.advanceTimersByTimeAsync(2000);
      expect(client.status).toBe('closed');
      expect(ws.closedWith?.code).toBe(1000);
    });
  });

  it('close during start rejects with the close code', async () => {
    const h = makeHarness();
    const client = new CartesiaAgentClient(h.options as never);
    const p = client.start();
    await flush();
    h.sockets[0]!.open();
    h.sockets[0]!.serverClose(1008, 'bad');
    await expect(p).rejects.toMatchObject({ code: 'closed', closeCode: 1008 });
    expect(client.status).toBe('closed');
  });

  it('a fatal error during start rejects with the server code', async () => {
    const h = makeHarness();
    const client = new CartesiaAgentClient(h.options as never);
    const p = client.start();
    await flush();
    const ws = h.sockets[0]!;
    ws.open();
    ws.message({ type: 'error', code: 'dynamic_variables_not_allowed', message: 'm', fatal: true });
    await expect(p).rejects.toMatchObject({ code: 'dynamic_variables_not_allowed' });
    expect(h.capture.stopped).toBe(true);
  });

  it('can start again after a close', async () => {
    const { client, ws, h } = await ready();
    ws.serverClose(1000);
    expect(client.status).toBe('closed');
    const p = client.start();
    await flush();
    expect(h.sockets).toHaveLength(2);
    h.sockets[1]!.open();
    h.sockets[1]!.message(READY);
    await p;
    expect(client.status).toBe('ready');
  });
});

describe('audio', () => {
  it('sends audio_output to the playback queue', async () => {
    const { h, ws } = await ready();
    ws.message({ type: 'audio_output', audio: b64(640) });
    expect(h.playback.chunks).toHaveLength(1);
    expect(h.playback.chunks[0]!.length).toBe(320);
  });

  it('clears playback before barge_in listeners run, even when empty', async () => {
    const { h, client, ws } = await ready();
    client.on('barge_in', () => h.log.push('barge_in'));
    ws.message({ type: 'audio_output_clear' });
    expect(h.log).toEqual(['clear', 'barge_in']);
    ws.message({ type: 'audio_output', audio: b64(640) });
    ws.message({ type: 'audio_output_clear' });
    expect(h.log).toEqual(['clear', 'barge_in', 'clear', 'barge_in']);
    expect(h.playback.chunks).toHaveLength(0);
  });

  it('keeps sending silence frames while muted', async () => {
    const { h, client, ws } = await ready();
    client.setMuted(true);
    expect(h.capture.muted).toBe(true);
    h.mic(new Int16Array(640));
    expect(ws.frames().at(-1).type).toBe('audio_input');
  });
});

describe('turns', () => {
  it('builds running transcripts and lets the final text win', async () => {
    const { client, ws } = await ready();
    const seen: Array<[string, boolean]> = [];
    client.on('transcript', (e) => seen.push([e.text, e.final]));
    ws.message({ type: 'turn_started', turn: 1, role: 'assistant', start_time: 0 });
    ws.message({ type: 'turn_output_text_delta', turn: 1, role: 'assistant', text: 'Hello' });
    ws.message({ type: 'turn_output_text_delta', turn: 1, role: 'assistant', text: ' there' });
    ws.message({
      type: 'turn_ended', turn: 1, role: 'assistant', text: 'Hello there!', interrupted: false,
      start_time: 0, end_time: 1, tool_calls: [],
    });
    expect(seen).toEqual([['Hello', false], ['Hello there', false], ['Hello there!', true]]);
  });

  it('emits speaking changes for the user turn', async () => {
    const { client, ws } = await ready();
    const who: string[] = [];
    client.on('speaking', (e) => who.push(e.who));
    ws.message({ type: 'turn_started', turn: 1, role: 'user', start_time: 0 });
    ws.message({
      type: 'turn_ended', turn: 1, role: 'user', text: 'hi', interrupted: false,
      start_time: 0, end_time: 1, tool_calls: [],
    });
    expect(who).toEqual(['user', 'none']);
  });

  it('closes open turns with a synthetic turn_ended when the socket closes', async () => {
    const { client, ws } = await ready();
    const ended: Array<{ turn: number; interrupted: boolean; synthetic: boolean; text: string }> = [];
    client.on('turn_ended', (e) => ended.push(e));
    ws.message({ type: 'turn_started', turn: 3, role: 'assistant', start_time: 0 });
    ws.message({ type: 'turn_output_text_delta', turn: 3, role: 'assistant', text: 'Bye' });
    ws.serverClose(1000);
    expect(ended).toEqual([
      expect.objectContaining({ turn: 3, interrupted: true, synthetic: true, text: 'Bye' }),
    ]);
  });
});

describe('tool calls', () => {
  const call = (expects: boolean, id = 't1') => ({
    type: 'client_tool_call', tool_call_id: id, tool_name: 'lookup', parameters: { q: 1 }, expects_response: expects,
  });

  it('respond sends one result, ignores a second, truncates', async () => {
    const { client, ws } = await ready();
    client.on('client_tool_call', (e) => {
      e.respond('é'.repeat(5000));
      e.respond('again');
    });
    ws.message(call(true));
    const results = ws.frames().filter((f) => f.type === 'client_tool_result');
    expect(results).toHaveLength(1);
    expect(results[0].tool_call_id).toBe('t1');
    expect(new TextEncoder().encode(results[0].result).length).toBeLessThanOrEqual(4096);
  });

  it('respond is a no-op when no response is expected', async () => {
    const { client, ws } = await ready();
    client.on('client_tool_call', (e) => e.respond('x'));
    ws.message(call(false));
    expect(ws.frames().some((f) => f.type === 'client_tool_result')).toBe(false);
  });

  it('runs a tools handler and answers', async () => {
    const { ws } = await ready({ tools: { lookup: (p: { q: number }) => ({ got: p.q }) } });
    ws.message(call(true));
    await flush();
    const r = ws.frames().find((f) => f.type === 'client_tool_result');
    expect(JSON.parse(r.result)).toEqual({ got: 1 });
    expect(r.is_error).toBeUndefined();
  });

  it('sends is_error when the handler throws', async () => {
    const { ws } = await ready({ tools: { lookup: () => { throw new Error('boom'); } } });
    ws.message(call(true));
    await flush();
    const r = ws.frames().find((f) => f.type === 'client_tool_result');
    expect(r).toMatchObject({ result: 'boom', is_error: true });
  });
});

describe('errors', () => {
  it('keeps the session after a non-fatal server error', async () => {
    const { client, ws } = await ready();
    const errs: unknown[] = [];
    client.on('error', (e) => errs.push(e));
    ws.message({ type: 'error', code: 'invalid_event', message: 'm', fatal: false });
    expect(client.status).toBe('ready');
    expect(errs).toEqual([{ code: 'invalid_event', message: 'm', fatal: false, source: 'server' }]);
  });

  it('ignores junk and unknown events', async () => {
    const { client, ws } = await ready();
    const raw: unknown[] = [];
    client.on('raw', (e) => raw.push(e.event));
    ws.message('not json');
    ws.message({ type: 'something_new' });
    expect(client.status).toBe('ready');
    expect(raw).toHaveLength(1);
  });
});
