import { Emitter } from './emitter';
import { CartesiaAgentError, describeCloseCode } from './errors';
import {
  type Capture,
  type CaptureOptions,
  DEFAULT_MIC_CONSTRAINTS,
  startCapture as defaultStartCapture,
} from './audio/capture';
import { PcmDecoder } from './audio/pcm';
import { PlaybackQueue, type PlaybackOptions } from './audio/playback';
import {
  type InputFormat,
  type OutputDelivery,
  type Role,
  type ToolCallRecord,
  buildAgentUrl,
  encodeAudioInput,
  encodeClientEvent,
  encodeSessionCreate,
  parseServerEvent,
  redactToken,
  truncateToolResult,
  truncateUtf8,
  MAX_ERROR_TYPE_BYTES,
} from './protocol';

export type AgentStatus = 'idle' | 'connecting' | 'ready' | 'closing' | 'closed' | 'error';

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface PlaybackLike {
  enqueue(pcm: Int16Array): void;
  clear(): void;
  dispose(): void;
  readonly playing: boolean;
  readonly bufferedMs: number;
}

export type ToolHandler = (params: Record<string, unknown>) => unknown | Promise<unknown>;

export interface CartesiaAgentOptions {
  agentId: string;
  getToken: () => Promise<string>;
  inputFormat?: InputFormat;
  outputDelivery?: OutputDelivery;
  connectTimeoutMs?: number;
  chunkMs?: number;
  prerollMs?: number;
  mic?: MediaTrackConstraints | boolean;
  tools?: Record<string, ToolHandler>;
  baseUrl?: string;
  webSocketFactory?: (url: string) => WebSocketLike;
  audioContextFactory?: (opts: { sampleRate?: number }) => AudioContext;
  captureFactory?: (opts: CaptureOptions) => Promise<Capture>;
  playbackFactory?: (ctx: AudioContext, opts: PlaybackOptions) => PlaybackLike;
}

export interface ToolResultOptions {
  isError?: boolean;
  errorType?: string;
}

export type ClientToolCallEvent = {
  toolCallId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  expectsResponse: boolean;
  respond(result: string, opts?: ToolResultOptions): void;
};

export interface AgentEventMap {
  status: { status: AgentStatus };
  ready: { callId: string; agentId: string; agentVersionId: string };
  turn_started: { turn: number; role: Role; startTime: number };
  turn_delta: { turn: number; text: string; fullText: string };
  turn_ended: {
    turn: number;
    role: Role;
    text: string;
    interrupted: boolean;
    startTime: number;
    endTime: number;
    toolCalls: ToolCallRecord[];
    synthetic: boolean;
  };
  transcript: { turn: number; role: Role; text: string; final: boolean; interrupted?: boolean };
  client_tool_call: ClientToolCallEvent;
  barge_in: Record<string, never>;
  speaking: { who: 'user' | 'agent' | 'none' };
  error: { code: string; message: string; fatal: boolean; source: 'server' | 'client' };
  close: { code: number; reason: string; clean: boolean };
  raw: { event: unknown };
}

const OPEN = 1;
const STOP_WAIT_MS = 1000;
const FATAL_FALLBACK_MS = 2000;

interface Deferred {
  resolve(): void;
  reject(err: unknown): void;
}

interface Session {
  ws: WebSocketLike | null;
  ctx: AudioContext | null;
  capture: Capture | null;
  playback: PlaybackLike | null;
  timer: ReturnType<typeof setTimeout> | null;
  fatalTimer: ReturnType<typeof setTimeout> | null;
  pending: Deferred | null;
  done: boolean;
  closeWaiters: Array<() => void>;
}

function asError(err: unknown, fallbackCode: string, fallbackMessage: string): CartesiaAgentError {
  if (err instanceof CartesiaAgentError) return err;
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return new CartesiaAgentError(fallbackCode, redactToken(raw) || fallbackMessage, { cause: err });
}

export class CartesiaAgentClient extends Emitter<AgentEventMap> {
  private _status: AgentStatus = 'idle';
  private _callId: string | null = null;
  private _muted = false;
  private session: Session | null = null;
  private stopping: Promise<void> | null = null;
  private turns = new Map<number, { role: Role; text: string; startTime: number }>();
  private answered = new Set<string>();
  private lastSpeaking: 'user' | 'agent' | 'none' = 'none';
  private decoder = new PcmDecoder();

  constructor(private readonly opts: CartesiaAgentOptions) {
    super();
  }

  get status(): AgentStatus {
    return this._status;
  }
  get callId(): string | null {
    return this._callId;
  }
  get muted(): boolean {
    return this._muted;
  }

  private get inputFormat(): InputFormat {
    return this.opts.inputFormat ?? 'pcm_16000';
  }
  private get rate(): number {
    return Number(this.inputFormat.split('_')[1]);
  }

  private setStatus(status: AgentStatus): void {
    if (this._status === status) return;
    this._status = status;
    this.emit('status', { status });
  }

  start(): Promise<void> {
    if (this._status !== 'idle' && this._status !== 'closed' && this._status !== 'error') {
      return Promise.reject(
        new CartesiaAgentError('invalid_state', `Cannot start while status is "${this._status}".`),
      );
    }
    const s: Session = {
      ws: null,
      ctx: null,
      capture: null,
      playback: null,
      timer: null,
      fatalTimer: null,
      pending: null,
      done: false,
      closeWaiters: [],
    };
    this.session = s;
    this.turns.clear();
    this.answered.clear();
    this.decoder.reset();
    this.lastSpeaking = 'none';
    this._callId = null;
    this.stopping = null;
    this.setStatus('connecting');

    const promise = new Promise<void>((resolve, reject) => {
      s.pending = { resolve, reject };
    });
    void this.run(s);
    return promise;
  }

  private async run(s: Session): Promise<void> {
    const timeoutMs = this.opts.connectTimeoutMs ?? 15000;
    try {
      const ctx = this.createContext();
      s.ctx = ctx;
      ctx.addEventListener?.('statechange', () => {
        if (this.session === s && this._status === 'ready' && ctx.state !== 'running') {
          this.emit('error', {
            code: 'audio_suspended',
            message: `The audio context is ${ctx.state}. Capture and playback may have stopped.`,
            fatal: false,
            source: 'client',
          });
        }
      });
      void ctx.resume?.().catch?.(() => {});

      s.playback = (this.opts.playbackFactory ?? ((c, o) => new PlaybackQueue(c, o)))(ctx, {
        sampleRate: this.rate,
        prerollMs: this.opts.prerollMs,
        onStart: () => this.updateSpeaking(),
        onIdle: () => this.updateSpeaking(),
      });

      const capture = await (this.opts.captureFactory ?? defaultStartCapture)({
        audioContext: ctx,
        targetRate: this.rate,
        chunkMs: this.opts.chunkMs ?? 40,
        constraints: this.opts.mic ?? DEFAULT_MIC_CONSTRAINTS,
        onChunk: (pcm) => this.onMicChunk(s, pcm),
      });
      if (s.done) {
        capture.stop();
        return;
      }
      s.capture = capture;
      capture.setMuted(this._muted);

      s.timer = setTimeout(() => {
        this.fail(
          s,
          new CartesiaAgentError(
            'connect_timeout',
            `The agent was not ready within ${timeoutMs} ms.`,
          ),
        );
      }, timeoutMs);

      let token: string;
      try {
        token = await this.opts.getToken();
      } catch (err) {
        throw asError(err, 'token_failed', 'Could not get an access token.');
      }
      if (s.done) return;
      if (!token) throw new CartesiaAgentError('token_failed', 'getToken returned an empty token.');

      const url = buildAgentUrl({
        agentId: this.opts.agentId,
        accessToken: token,
        baseUrl: this.opts.baseUrl,
      });
      const ws = (this.opts.webSocketFactory ?? ((u) => new WebSocket(u) as WebSocketLike))(url);
      s.ws = ws;
      ws.onopen = () => {
        if (s.done) return;
        ws.send(
          encodeSessionCreate({
            inputFormat: this.inputFormat,
            outputDelivery: this.opts.outputDelivery ?? 'as_available',
          }),
        );
      };
      ws.onmessage = (ev) => this.onMessage(s, ev.data);
      ws.onerror = () => {
        if (s.done) return;
        this.emit('error', {
          code: 'socket_error',
          message: 'The WebSocket reported an error.',
          fatal: false,
          source: 'client',
        });
      };
      ws.onclose = (ev) => this.onSocketClose(s, ev.code, ev.reason);
    } catch (err) {
      this.fail(s, asError(err, 'connect_failed', 'Could not start the session.'));
    }
  }

  private createContext(): AudioContext {
    const factory =
      this.opts.audioContextFactory ??
      ((o: { sampleRate?: number }) => {
        try {
          return new AudioContext(o);
        } catch {
          return new AudioContext();
        }
      });
    return factory({ sampleRate: this.rate });
  }

  private onMicChunk(s: Session, pcm: Int16Array): void {
    if (s.done || this._status !== 'ready' || !s.ws || s.ws.readyState !== OPEN) return;
    s.ws.send(encodeAudioInput(pcm));
  }

  private onMessage(s: Session, data: unknown): void {
    if (s.done || typeof data !== 'string') return;
    const ev = parseServerEvent(data);
    if (!ev) return;
    switch (ev.type) {
      case 'session_ready': {
        if (s.timer) clearTimeout(s.timer);
        s.timer = null;
        this._callId = ev.call_id;
        this.setStatus('ready');
        this.emit('ready', {
          callId: ev.call_id,
          agentId: ev.agent_id,
          agentVersionId: ev.agent_version_id,
        });
        s.pending?.resolve();
        s.pending = null;
        break;
      }
      case 'audio_output': {
        const pcm = this.decoder.decode(ev.audio);
        s.playback?.enqueue(pcm);
        break;
      }
      case 'audio_output_clear': {
        s.playback?.clear();
        this.decoder.reset();
        this.emit('barge_in', {});
        this.updateSpeaking();
        break;
      }
      case 'turn_started': {
        this.turns.set(ev.turn, { role: ev.role, text: '', startTime: ev.start_time });
        this.emit('turn_started', { turn: ev.turn, role: ev.role, startTime: ev.start_time });
        this.updateSpeaking();
        break;
      }
      case 'turn_output_text_delta': {
        const t = this.turns.get(ev.turn) ?? { role: ev.role, text: '', startTime: 0 };
        t.text += ev.text;
        this.turns.set(ev.turn, t);
        this.emit('turn_delta', { turn: ev.turn, text: ev.text, fullText: t.text });
        this.emit('transcript', { turn: ev.turn, role: t.role, text: t.text, final: false });
        break;
      }
      case 'turn_ended': {
        this.turns.delete(ev.turn);
        this.emit('turn_ended', {
          turn: ev.turn,
          role: ev.role,
          text: ev.text,
          interrupted: ev.interrupted,
          startTime: ev.start_time,
          endTime: ev.end_time,
          toolCalls: ev.tool_calls ?? [],
          synthetic: false,
        });
        this.emit('transcript', {
          turn: ev.turn,
          role: ev.role,
          text: ev.text,
          final: true,
          interrupted: ev.interrupted,
        });
        this.updateSpeaking();
        break;
      }
      case 'client_tool_call':
        this.onToolCall(s, ev);
        break;
      case 'error': {
        this.emit('error', {
          code: ev.code,
          message: ev.message,
          fatal: ev.fatal,
          source: 'server',
        });
        if (ev.fatal) {
          if (s.pending) {
            this.fail(s, new CartesiaAgentError(ev.code, ev.message), false);
          } else if (!s.fatalTimer) {
            s.fatalTimer = setTimeout(() => this.teardown(s, 1000, 'fatal error'), FATAL_FALLBACK_MS);
          }
        }
        break;
      }
      default:
        this.emit('raw', { event: ev });
    }
  }

  private onToolCall(
    s: Session,
    ev: Extract<import('./protocol').ServerEvent, { type: 'client_tool_call' }>,
  ): void {
    const respond = (result: string, o: ToolResultOptions = {}) => {
      if (!ev.expects_response || this.answered.has(ev.tool_call_id)) return;
      this.answered.add(ev.tool_call_id);
      this.sendRaw(
        s,
        encodeClientEvent({
          type: 'client_tool_result',
          tool_call_id: ev.tool_call_id,
          result: truncateToolResult(result),
          ...(o.isError ? { is_error: true } : {}),
          ...(o.errorType
            ? { error_type: truncateUtf8(o.errorType, MAX_ERROR_TYPE_BYTES) }
            : {}),
        }),
      );
    };
    this.emit('client_tool_call', {
      toolCallId: ev.tool_call_id,
      toolName: ev.tool_name,
      parameters: ev.parameters ?? {},
      expectsResponse: ev.expects_response,
      respond,
    });
    const handler = this.opts.tools?.[ev.tool_name];
    if (!handler) return;
    void (async () => {
      try {
        const out = await handler(ev.parameters ?? {});
        respond(typeof out === 'string' ? out : (JSON.stringify(out ?? null) ?? 'null'));
      } catch (err) {
        respond(err instanceof Error ? err.message : String(err), {
          isError: true,
          errorType: err instanceof Error ? err.name : 'Error',
        });
      }
    })();
  }

  private sendRaw(s: Session, frame: string): void {
    if (s.done || !s.ws || s.ws.readyState !== OPEN) return;
    s.ws.send(frame);
  }

  sendToolResult(id: string, result: string, opts: ToolResultOptions = {}): void {
    const s = this.session;
    if (!s || this._status !== 'ready') return;
    this.sendRaw(
      s,
      encodeClientEvent({
        type: 'client_tool_result',
        tool_call_id: id,
        result: truncateToolResult(result),
        ...(opts.isError ? { is_error: true } : {}),
        ...(opts.errorType
          ? { error_type: truncateUtf8(opts.errorType, MAX_ERROR_TYPE_BYTES) }
          : {}),
      }),
    );
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    this.session?.capture?.setMuted(muted);
  }

  private updateSpeaking(): void {
    const userOpen = [...this.turns.values()].some((t) => t.role === 'user');
    const who = userOpen ? 'user' : this.session?.playback?.playing ? 'agent' : 'none';
    if (who === this.lastSpeaking) return;
    this.lastSpeaking = who;
    this.emit('speaking', { who });
  }

  private onSocketClose(s: Session, code: number, reason: string): void {
    if (s.done) {
      s.closeWaiters.splice(0).forEach((f) => f());
      return;
    }
    const err = s.pending
      ? new CartesiaAgentError('closed', describeCloseCode(code), { closeCode: code })
      : null;
    this.teardown(s, code, reason, err, true);
  }

  private fail(s: Session, err: CartesiaAgentError, emitError = true): void {
    if (s.done) return;
    if (emitError) {
      this.emit('error', { code: err.code, message: err.message, fatal: true, source: 'client' });
    }
    this.setStatus('error');
    this.teardown(s, 1000, 'client error', err, false);
  }

  private teardown(
    s: Session,
    code: number,
    reason: string,
    err: CartesiaAgentError | null = null,
    socketClosed = false,
  ): void {
    if (s.done) return;
    s.done = true;
    if (s.timer) clearTimeout(s.timer);
    if (s.fatalTimer) clearTimeout(s.fatalTimer);

    for (const [turn, t] of this.turns) {
      this.emit('turn_ended', {
        turn,
        role: t.role,
        text: t.text,
        interrupted: true,
        startTime: t.startTime,
        endTime: t.startTime,
        toolCalls: [],
        synthetic: true,
      });
      this.emit('transcript', { turn, role: t.role, text: t.text, final: true, interrupted: true });
    }
    this.turns.clear();

    try {
      s.playback?.dispose();
    } catch {
      // ignore
    }
    try {
      s.capture?.stop();
    } catch {
      // ignore
    }
    void s.ctx?.close?.().catch?.(() => {});

    const ws = s.ws;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      if (!socketClosed) {
        try {
          ws.close(1000, 'session completed');
        } catch {
          // ignore
        }
      }
    }

    this.updateSpeaking();
    if (this._status !== 'error') this.setStatus('closed');
    if (ws) {
      this.emit('close', {
        code,
        reason,
        clean: code === 1000,
      });
    }
    if (s.pending) {
      s.pending.reject(err ?? new CartesiaAgentError('closed', 'The session was closed.'));
      s.pending = null;
    }
    s.closeWaiters.splice(0).forEach((f) => f());
  }

  stop(reason = 'session completed'): Promise<void> {
    const s = this.session;
    if (!s || s.done) return Promise.resolve();
    if (this.stopping) return this.stopping;

    if (this._status === 'connecting') {
      this.teardown(s, 1000, reason, new CartesiaAgentError('closed', 'Stopped before ready.'));
      return Promise.resolve();
    }

    this.setStatus('closing');
    this.stopping = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.teardown(s, 1000, reason);
        resolve();
      }, STOP_WAIT_MS);
      s.closeWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
      const ws = s.ws;
      if (!ws || ws.readyState !== OPEN) {
        clearTimeout(timer);
        this.teardown(s, 1000, reason);
        resolve();
        return;
      }
      try {
        ws.close(1000, reason);
      } catch {
        // the timer finishes the job
      }
    });
    return this.stopping;
  }
}
