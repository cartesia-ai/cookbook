import { describe, expect, it } from 'vitest';
import {
  buildAgentUrl,
  encodeAudioInput,
  encodeSessionCreate,
  parseServerEvent,
  redactToken,
  truncateToolResult,
  MAX_TOOL_RESULT_BYTES,
} from '../src/protocol';
import { base64ToBytes } from '../src/audio/pcm';

describe('buildAgentUrl', () => {
  it('builds path, version and encoded token', () => {
    const u = new URL(buildAgentUrl({ agentId: 'agent_1', accessToken: 'a+b/c=d&e' }));
    expect(u.protocol).toBe('wss:');
    expect(u.host).toBe('api.cartesia.ai');
    expect(u.pathname).toBe('/v1/agents/websocket/agent_1');
    expect(u.searchParams.get('cartesia_version')).toBe('2026-08-14');
    expect(u.searchParams.get('access_token')).toBe('a+b/c=d&e');
  });
  it('rejects empty inputs', () => {
    expect(() => buildAgentUrl({ agentId: '', accessToken: 't' })).toThrow();
    expect(() => buildAgentUrl({ agentId: 'a', accessToken: '' })).toThrow();
  });
  it('redacts tokens from strings', () => {
    const url = buildAgentUrl({ agentId: 'a', accessToken: 'secret-token' });
    expect(redactToken(`failed to open ${url} now`)).not.toContain('secret-token');
  });
});

describe('frames', () => {
  it('encodes session_create', () => {
    expect(
      JSON.parse(encodeSessionCreate({ inputFormat: 'pcm_16000', outputDelivery: 'as_available' })),
    ).toEqual({
      type: 'session_create',
      audio: { input_format: 'pcm_16000', output_delivery: 'as_available' },
    });
  });
  it('encodes audio_input as little-endian base64', () => {
    const frame = JSON.parse(encodeAudioInput(new Int16Array([1, -2, 256])));
    expect(frame.type).toBe('audio_input');
    expect([...base64ToBytes(frame.audio)]).toEqual([1, 0, 254, 255, 0, 1]);
  });
});

describe('parseServerEvent', () => {
  it('passes known events through', () => {
    for (const type of [
      'session_ready',
      'audio_output',
      'audio_output_clear',
      'turn_started',
      'turn_output_text_delta',
      'turn_ended',
      'client_tool_call',
      'error',
      'dtmf_output',
    ]) {
      expect(parseServerEvent(JSON.stringify({ type }))?.type).toBe(type);
    }
  });
  it('wraps unknown types', () => {
    expect(parseServerEvent('{"type":"future_thing","x":1}')).toEqual({
      type: 'unknown',
      raw: { type: 'future_thing', x: 1 },
    });
  });
  it('returns null and never throws on junk', () => {
    for (const raw of ['not json', 'null', '42', '[]', '"s"', '{}', '{"type":3}', '']) {
      expect(parseServerEvent(raw)).toBeNull();
    }
  });
});

describe('truncateToolResult', () => {
  it('leaves short strings alone', () => {
    expect(truncateToolResult('hello')).toBe('hello');
  });
  it('cuts on a character boundary', () => {
    const s = 'a' + 'é'.repeat(3000);
    const out = truncateToolResult(s);
    const bytes = new TextEncoder().encode(out).length;
    expect(bytes).toBeLessThanOrEqual(MAX_TOOL_RESULT_BYTES);
    expect(bytes).toBeGreaterThan(MAX_TOOL_RESULT_BYTES - 2);
    expect(out).not.toContain('�');
  });
  it('does not split an emoji at the boundary', () => {
    const s = 'a'.repeat(MAX_TOOL_RESULT_BYTES - 2) + '😀';
    const out = truncateToolResult(s);
    expect(out).toBe('a'.repeat(MAX_TOOL_RESULT_BYTES - 2));
  });
});
