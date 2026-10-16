import { int16ToBase64 } from './audio/pcm';

export const AGENTS_API_VERSION = '2026-08-14';
export const AGENTS_WS_BASE = 'wss://api.cartesia.ai/v1/agents/websocket';
export const MAX_TOOL_RESULT_BYTES = 4096;
export const MAX_ERROR_TYPE_BYTES = 256;

export type InputFormat = 'pcm_16000' | 'pcm_24000' | 'pcm_44100';
export type OutputDelivery = 'speaking_pace' | 'as_available';
export type Role = 'user' | 'assistant';

export interface ToolCallRecord {
  name: string;
  arguments: unknown;
  result?: unknown;
  id?: string;
  dynamic_variable_updates?: unknown[];
}

export type ServerEvent =
  | {
      type: 'session_ready';
      call_id: string;
      agent_id: string;
      agent_version_id: string;
      audio: { input_format?: string; output_delivery?: string };
    }
  | { type: 'audio_output'; audio: string }
  | { type: 'audio_output_clear' }
  | { type: 'turn_started'; turn: number; role: Role; start_time: number }
  | { type: 'turn_output_text_delta'; turn: number; role: 'assistant'; text: string }
  | {
      type: 'turn_ended';
      turn: number;
      role: Role;
      text: string;
      interrupted: boolean;
      start_time: number;
      end_time: number;
      eager_end_timestamp?: number;
      tool_calls: ToolCallRecord[];
    }
  | {
      type: 'client_tool_call';
      tool_call_id: string;
      tool_name: string;
      parameters: Record<string, unknown>;
      expects_response: boolean;
    }
  | { type: 'error'; code: string; message: string; fatal: boolean }
  | { type: 'dtmf_output'; digit: string };

export type UnknownEvent = { type: 'unknown'; raw: unknown };

export type ClientEvent =
  | {
      type: 'session_create';
      audio: { input_format: InputFormat; output_delivery?: OutputDelivery };
    }
  | { type: 'audio_input'; audio: string }
  | {
      type: 'client_tool_result';
      tool_call_id: string;
      result: string;
      is_error?: boolean;
      error_type?: string;
    }
  | { type: 'dtmf_input'; digit: string };

export function buildAgentUrl(opts: {
  agentId: string;
  accessToken: string;
  baseUrl?: string;
}): string {
  if (!opts.agentId) throw new Error('agentId is required');
  if (!opts.accessToken) throw new Error('accessToken is required');
  const url = new URL(`${opts.baseUrl ?? AGENTS_WS_BASE}/${encodeURIComponent(opts.agentId)}`);
  url.searchParams.set('cartesia_version', AGENTS_API_VERSION);
  url.searchParams.set('access_token', opts.accessToken);
  return url.toString();
}

export function redactToken(s: string): string {
  return s.replace(/access_token=[^&\s"']*/g, 'access_token=REDACTED');
}

export function encodeClientEvent(event: ClientEvent): string {
  return JSON.stringify(event);
}

export function encodeSessionCreate(audio: {
  inputFormat: InputFormat;
  outputDelivery?: OutputDelivery;
}): string {
  return encodeClientEvent({
    type: 'session_create',
    audio: { input_format: audio.inputFormat, output_delivery: audio.outputDelivery },
  });
}

export function encodeAudioInput(pcm: Int16Array): string {
  return encodeClientEvent({ type: 'audio_input', audio: int16ToBase64(pcm) });
}

const KNOWN = new Set([
  'session_ready',
  'audio_output',
  'audio_output_clear',
  'turn_started',
  'turn_output_text_delta',
  'turn_ended',
  'client_tool_call',
  'error',
  'dtmf_output',
]);

export function parseServerEvent(raw: string): ServerEvent | UnknownEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const type = (value as { type?: unknown }).type;
  if (typeof type !== 'string') return null;
  if (!KNOWN.has(type)) return { type: 'unknown', raw: value };
  return value as ServerEvent;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

export function truncateUtf8(s: string, max: number): string {
  const bytes = encoder.encode(s);
  if (bytes.length <= max) return s;
  let end = max;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return decoder.decode(bytes.subarray(0, end));
}

export function truncateToolResult(s: string): string {
  return truncateUtf8(s, MAX_TOOL_RESULT_BYTES);
}
