// Bundled from packages/agents-web/src/index.ts in the Cartesia cookbook repo (Apache-2.0).
// Regenerate with scripts/vendor-agents-web.sh. Do not edit by hand.
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// ../../packages/agents-web/src/audio/pcm.ts
function floatToInt16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    let s = f32[i];
    if (Number.isNaN(s)) s = 0;
    s = s > 1 ? 1 : s < -1 ? -1 : s;
    out[i] = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
  }
  return out;
}
function int16ToFloat(i16) {
  const out = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) {
    const v = i16[i];
    out[i] = v < 0 ? v / 32768 : v / 32767;
  }
  return out;
}
var Resampler = class {
  // read position (fractional) into buf, in input samples
  constructor(inRate, outRate) {
    this.inRate = inRate;
    this.outRate = outRate;
    __publicField(this, "ratio");
    // input samples per output sample
    __publicField(this, "buf", []);
    __publicField(this, "pos", 0);
    if (!(inRate > 0) || !(outRate > 0)) throw new Error("sample rates must be positive");
    this.ratio = inRate / outRate;
  }
  process(input) {
    if (this.inRate === this.outRate) return input;
    for (let i = 0; i < input.length; i++) this.buf.push(input[i]);
    const out = [];
    const eps = 1e-9;
    if (this.ratio > 1) {
      while (this.pos + this.ratio <= this.buf.length + eps) {
        const start = this.pos;
        const end = start + this.ratio;
        let sum = 0;
        let weight = 0;
        for (let k = Math.floor(start); k < Math.ceil(end - eps) && k < this.buf.length; k++) {
          const w = Math.min(k + 1, end) - Math.max(k, start);
          if (w <= 0) continue;
          sum += this.buf[k] * w;
          weight += w;
        }
        out.push(weight > 0 ? sum / weight : 0);
        this.pos = end;
      }
    } else {
      while (Math.floor(this.pos) + 1 < this.buf.length) {
        const i = Math.floor(this.pos);
        const frac = this.pos - i;
        out.push(this.buf[i] * (1 - frac) + this.buf[i + 1] * frac);
        this.pos += this.ratio;
      }
    }
    const drop = Math.floor(this.pos + eps);
    if (drop > 0) {
      this.buf = this.buf.slice(drop);
      this.pos -= drop;
    }
    return Float32Array.from(out);
  }
  reset() {
    this.buf = [];
    this.pos = 0;
  }
};
var Chunker = class {
  constructor(samplesPerChunk) {
    this.samplesPerChunk = samplesPerChunk;
    __publicField(this, "pending", new Int16Array(0));
    if (!Number.isInteger(samplesPerChunk) || samplesPerChunk <= 0) {
      throw new Error("samplesPerChunk must be a positive integer");
    }
  }
  push(samples) {
    const merged = new Int16Array(this.pending.length + samples.length);
    merged.set(this.pending);
    merged.set(samples, this.pending.length);
    const chunks = [];
    let offset = 0;
    while (merged.length - offset >= this.samplesPerChunk) {
      chunks.push(merged.slice(offset, offset + this.samplesPerChunk));
      offset += this.samplesPerChunk;
    }
    this.pending = merged.slice(offset);
    return chunks;
  }
  /** Returns whatever is left (shorter than a chunk) and empties the buffer. */
  flush() {
    const rest = this.pending;
    this.pending = new Int16Array(0);
    return rest;
  }
};
function samplesForChunk(rate, chunkMs) {
  if (chunkMs < 20 || chunkMs > 100) throw new Error("chunkMs must be between 20 and 100");
  return Math.round(rate * chunkMs / 1e3);
}
function bytesToBase64(bytes) {
  let binary = "";
  const slice = 32768;
  for (let i = 0; i < bytes.length; i += slice) {
    binary += String.fromCharCode(...bytes.subarray(i, i + slice));
  }
  return btoa(binary);
}
function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
function int16ToBytes(samples) {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) view.setInt16(i * 2, samples[i], true);
  return out;
}
function int16ToBase64(samples) {
  return bytesToBase64(int16ToBytes(samples));
}
var PcmDecoder = class {
  constructor() {
    __publicField(this, "carry", null);
  }
  decode(b64) {
    let bytes = base64ToBytes(b64);
    if (this.carry !== null) {
      const merged = new Uint8Array(bytes.length + 1);
      merged[0] = this.carry;
      merged.set(bytes, 1);
      bytes = merged;
      this.carry = null;
    }
    if (bytes.length % 2 === 1) {
      this.carry = bytes[bytes.length - 1];
      bytes = bytes.subarray(0, bytes.length - 1);
    }
    const out = new Int16Array(bytes.length / 2);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true);
    return out;
  }
  reset() {
    this.carry = null;
  }
};

// ../../packages/agents-web/src/protocol.ts
var AGENTS_API_VERSION = "2026-08-14";
var AGENTS_WS_BASE = "wss://api.cartesia.ai/v1/agents/websocket";
var MAX_TOOL_RESULT_BYTES = 4096;
var MAX_ERROR_TYPE_BYTES = 256;
function buildAgentUrl(opts) {
  if (!opts.agentId) throw new Error("agentId is required");
  if (!opts.accessToken) throw new Error("accessToken is required");
  const url = new URL(`${opts.baseUrl ?? AGENTS_WS_BASE}/${encodeURIComponent(opts.agentId)}`);
  url.searchParams.set("cartesia_version", AGENTS_API_VERSION);
  url.searchParams.set("access_token", opts.accessToken);
  return url.toString();
}
function redactToken(s) {
  return s.replace(/access_token=[^&\s"']*/g, "access_token=REDACTED");
}
function encodeClientEvent(event) {
  return JSON.stringify(event);
}
function encodeSessionCreate(audio) {
  return encodeClientEvent({
    type: "session_create",
    audio: { input_format: audio.inputFormat, output_delivery: audio.outputDelivery }
  });
}
function encodeAudioInput(pcm) {
  return encodeClientEvent({ type: "audio_input", audio: int16ToBase64(pcm) });
}
var KNOWN = /* @__PURE__ */ new Set([
  "session_ready",
  "audio_output",
  "audio_output_clear",
  "turn_started",
  "turn_output_text_delta",
  "turn_ended",
  "client_tool_call",
  "error",
  "dtmf_output"
]);
function parseServerEvent(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const type = value.type;
  if (typeof type !== "string") return null;
  if (!KNOWN.has(type)) return { type: "unknown", raw: value };
  return value;
}
var encoder = new TextEncoder();
var decoder = new TextDecoder("utf-8", { fatal: false });
function truncateUtf8(s, max) {
  const bytes = encoder.encode(s);
  if (bytes.length <= max) return s;
  let end = max;
  while (end > 0 && (bytes[end] & 192) === 128) end--;
  return decoder.decode(bytes.subarray(0, end));
}
function truncateToolResult(s) {
  return truncateUtf8(s, MAX_TOOL_RESULT_BYTES);
}

// ../../packages/agents-web/src/errors.ts
var CartesiaAgentError = class extends Error {
  constructor(code, message, opts = {}) {
    super(message, opts.cause !== void 0 ? { cause: opts.cause } : void 0);
    __publicField(this, "code");
    /** WebSocket close code, when the error came from a close. */
    __publicField(this, "closeCode");
    this.name = "CartesiaAgentError";
    this.code = code;
    this.closeCode = opts.closeCode;
  }
};
function describeCloseCode(code) {
  switch (code) {
    case 1e3:
      return "Session ended normally.";
    case 1008:
      return "The server rejected the session as a protocol error (close 1008). Check the access token and the first event.";
    case 1009:
      return "A message was larger than 32 KiB (close 1009).";
    case 1011:
      return "The agent failed (close 1011).";
    case 1006:
      return "The connection dropped before a clean close (1006). The token may be invalid or expired, or the network failed.";
    default:
      return `The connection closed (code ${code}).`;
  }
}

// ../../packages/agents-web/src/emitter.ts
var Emitter = class {
  constructor() {
    __publicField(this, "listeners", /* @__PURE__ */ new Map());
  }
  on(type, fn) {
    let set = this.listeners.get(type);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }
  emit(type, event) {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(event);
      } catch {
      }
    }
  }
};

// ../../packages/agents-web/src/audio/worklet-source.ts
var CAPTURE_PROCESSOR_NAME = "cartesia-capture";
var CAPTURE_WORKLET_SOURCE = `
class CartesiaCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) {
      const copy = new Float32Array(channel);
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor('${CAPTURE_PROCESSOR_NAME}', CartesiaCaptureProcessor);
`;

// ../../packages/agents-web/src/audio/capture.ts
var DEFAULT_MIC_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1
};
async function getMicStream(constraints = DEFAULT_MIC_CONSTRAINTS) {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new CartesiaAgentError(
      "mic_unavailable",
      "getUserMedia is not available. Use HTTPS or localhost."
    );
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: constraints });
  } catch (err) {
    const name = err?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new CartesiaAgentError("mic_denied", "Microphone permission was denied.", {
        cause: err
      });
    }
    throw new CartesiaAgentError("mic_unavailable", "No usable microphone was found.", {
      cause: err
    });
  }
}
async function startCapture(opts) {
  const ctx = opts.audioContext;
  const stream = opts.stream ?? await getMicStream(opts.constraints);
  const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET_SOURCE], { type: "text/javascript" }));
  try {
    await ctx.audioWorklet.addModule(url);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw new CartesiaAgentError(
      "worklet_failed",
      "Could not load the audio worklet. If you set a CSP, allow worker-src blob:.",
      { cause: err }
    );
  } finally {
    URL.revokeObjectURL(url);
  }
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, CAPTURE_PROCESSOR_NAME);
  const silent = ctx.createGain();
  silent.gain.value = 0;
  source.connect(node);
  node.connect(silent);
  silent.connect(ctx.destination);
  const resampler = new Resampler(ctx.sampleRate, opts.targetRate);
  const chunker = new Chunker(samplesForChunk(opts.targetRate, opts.chunkMs));
  let muted = false;
  let stopped = false;
  node.port.onmessage = (e) => {
    if (stopped) return;
    const block = muted ? new Float32Array(e.data.length) : e.data;
    const pcm = floatToInt16(resampler.process(block));
    for (const chunk of chunker.push(pcm)) opts.onChunk(chunk);
  };
  return {
    setMuted(m) {
      muted = m;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      node.port.onmessage = null;
      try {
        source.disconnect();
        node.disconnect();
        silent.disconnect();
      } catch {
      }
      stream.getTracks().forEach((t) => t.stop());
    }
  };
}

// ../../packages/agents-web/src/audio/playback.ts
var PlaybackQueue = class {
  constructor(ctx, opts) {
    this.ctx = ctx;
    this.opts = opts;
    __publicField(this, "live", []);
    __publicField(this, "nextStartTime", 0);
    __publicField(this, "generation", 0);
    __publicField(this, "disposed", false);
    __publicField(this, "prerollMs");
    __publicField(this, "maxQueueMs");
    this.prerollMs = opts.prerollMs ?? 80;
    this.maxQueueMs = opts.maxQueueMs ?? 3e4;
  }
  get bufferedMs() {
    if (this.live.length === 0) return 0;
    const now = this.ctx.currentTime;
    const last = this.live[this.live.length - 1];
    return Math.max(0, (last.end - now) * 1e3);
  }
  get playing() {
    return this.live.length > 0;
  }
  enqueue(pcm) {
    if (this.disposed || pcm.length === 0) return;
    const ctx = this.ctx;
    const wasEmpty = this.live.length === 0;
    this.trimOverflow(pcm.length / this.opts.sampleRate * 1e3);
    const now = ctx.currentTime;
    const earliest = now + this.prerollMs / 1e3;
    if (wasEmpty || this.nextStartTime < now) {
      this.nextStartTime = earliest;
    }
    const buffer = ctx.createBuffer(1, pcm.length, this.opts.sampleRate);
    buffer.copyToChannel(int16ToFloat(pcm), 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const start = this.nextStartTime;
    const end = start + pcm.length / this.opts.sampleRate;
    const entry = { source, start, end };
    const gen = this.generation;
    source.onended = () => {
      if (gen !== this.generation) return;
      this.live = this.live.filter((l) => l !== entry);
      if (this.live.length === 0) this.opts.onIdle?.();
    };
    source.start(start);
    this.nextStartTime = end;
    this.live.push(entry);
    if (wasEmpty) this.opts.onStart?.();
  }
  /**
   * Past maxQueueMs the backlog is stale (a stalled tab, for example). Drop all
   * audio that has not started yet so playback resumes near real time instead
   * of lagging further behind. Runs before a new chunk is scheduled.
   */
  trimOverflow(incomingMs) {
    if (this.bufferedMs + incomingMs <= this.maxQueueMs) return;
    const now = this.ctx.currentTime;
    let dropped = 0;
    const keep = [];
    for (const l of this.live) {
      if (l.start <= now) {
        keep.push(l);
        continue;
      }
      l.source.onended = null;
      try {
        l.source.stop();
      } catch {
      }
      l.source.disconnect();
      dropped += (l.end - l.start) * 1e3;
    }
    this.live = keep;
    this.nextStartTime = keep.length ? keep[keep.length - 1].end : 0;
    if (dropped > 0) this.opts.onOverflow?.(dropped);
  }
  clear() {
    this.generation++;
    const hadAudio = this.live.length > 0;
    for (const { source } of this.live) {
      source.onended = null;
      try {
        source.stop();
      } catch {
      }
      source.disconnect();
    }
    this.live = [];
    this.nextStartTime = 0;
    if (hadAudio) this.opts.onIdle?.();
  }
  dispose() {
    this.clear();
    this.disposed = true;
  }
};

// ../../packages/agents-web/src/client.ts
var OPEN = 1;
var STOP_WAIT_MS = 1e3;
var FATAL_FALLBACK_MS = 2e3;
function asError(err, fallbackCode, fallbackMessage) {
  if (err instanceof CartesiaAgentError) return err;
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return new CartesiaAgentError(fallbackCode, redactToken(raw) || fallbackMessage, { cause: err });
}
var CartesiaAgentClient = class extends Emitter {
  constructor(opts) {
    super();
    this.opts = opts;
    __publicField(this, "_status", "idle");
    __publicField(this, "_callId", null);
    __publicField(this, "_muted", false);
    __publicField(this, "session", null);
    __publicField(this, "stopping", null);
    __publicField(this, "turns", /* @__PURE__ */ new Map());
    __publicField(this, "answered", /* @__PURE__ */ new Set());
    __publicField(this, "lastSpeaking", "none");
    __publicField(this, "decoder", new PcmDecoder());
  }
  get status() {
    return this._status;
  }
  get callId() {
    return this._callId;
  }
  get muted() {
    return this._muted;
  }
  get inputFormat() {
    return this.opts.inputFormat ?? "pcm_16000";
  }
  get rate() {
    return Number(this.inputFormat.split("_")[1]);
  }
  setStatus(status) {
    if (this._status === status) return;
    this._status = status;
    this.emit("status", { status });
  }
  /**
   * Resolves at session_ready. Rejects on any failure or timeout. Call it from
   * a click handler: browsers require a user gesture for the mic and audio.
   */
  start() {
    if (this._status !== "idle" && this._status !== "closed" && this._status !== "error") {
      return Promise.reject(
        new CartesiaAgentError("invalid_state", `Cannot start while status is "${this._status}".`)
      );
    }
    const s = {
      ws: null,
      ctx: null,
      capture: null,
      playback: null,
      timer: null,
      fatalTimer: null,
      pending: null,
      done: false,
      closeWaiters: []
    };
    this.session = s;
    this.turns.clear();
    this.answered.clear();
    this.decoder.reset();
    this.lastSpeaking = "none";
    this._callId = null;
    this.stopping = null;
    this.setStatus("connecting");
    const promise = new Promise((resolve, reject) => {
      s.pending = { resolve, reject };
    });
    void this.run(s);
    return promise;
  }
  async run(s) {
    const timeoutMs = this.opts.connectTimeoutMs ?? 15e3;
    try {
      const ctx = this.createContext();
      s.ctx = ctx;
      ctx.addEventListener?.("statechange", () => {
        if (this.session === s && this._status === "ready" && ctx.state !== "running") {
          this.emit("error", {
            code: "audio_suspended",
            message: `The audio context is ${ctx.state}. Capture and playback may have stopped.`,
            fatal: false,
            source: "client"
          });
        }
      });
      void ctx.resume?.().catch?.(() => {
      });
      s.playback = (this.opts.playbackFactory ?? ((c, o) => new PlaybackQueue(c, o)))(ctx, {
        sampleRate: this.rate,
        prerollMs: this.opts.prerollMs,
        onStart: () => this.updateSpeaking(),
        onIdle: () => this.updateSpeaking()
      });
      const capture = await (this.opts.captureFactory ?? startCapture)({
        audioContext: ctx,
        targetRate: this.rate,
        chunkMs: this.opts.chunkMs ?? 40,
        constraints: this.opts.mic ?? DEFAULT_MIC_CONSTRAINTS,
        onChunk: (pcm) => this.onMicChunk(s, pcm)
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
            "connect_timeout",
            `The agent was not ready within ${timeoutMs} ms.`
          )
        );
      }, timeoutMs);
      let token;
      try {
        token = await this.opts.getToken();
      } catch (err) {
        throw asError(err, "token_failed", "Could not get an access token.");
      }
      if (s.done) return;
      if (!token) throw new CartesiaAgentError("token_failed", "getToken returned an empty token.");
      const url = buildAgentUrl({
        agentId: this.opts.agentId,
        accessToken: token,
        baseUrl: this.opts.baseUrl
      });
      const ws = (this.opts.webSocketFactory ?? ((u) => new WebSocket(u)))(url);
      s.ws = ws;
      ws.onopen = () => {
        if (s.done) return;
        ws.send(
          encodeSessionCreate({
            inputFormat: this.inputFormat,
            outputDelivery: this.opts.outputDelivery ?? "as_available"
          })
        );
      };
      ws.onmessage = (ev) => this.onMessage(s, ev.data);
      ws.onerror = () => {
        if (s.done) return;
        this.emit("error", {
          code: "socket_error",
          message: "The WebSocket reported an error.",
          fatal: false,
          source: "client"
        });
      };
      ws.onclose = (ev) => this.onSocketClose(s, ev.code, ev.reason);
    } catch (err) {
      this.fail(s, asError(err, "connect_failed", "Could not start the session."));
    }
  }
  createContext() {
    const factory = this.opts.audioContextFactory ?? ((o) => {
      try {
        return new AudioContext(o);
      } catch {
        return new AudioContext();
      }
    });
    return factory({ sampleRate: this.rate });
  }
  onMicChunk(s, pcm) {
    if (s.done || this._status !== "ready" || !s.ws || s.ws.readyState !== OPEN) return;
    s.ws.send(encodeAudioInput(pcm));
  }
  onMessage(s, data) {
    if (s.done || typeof data !== "string") return;
    const ev = parseServerEvent(data);
    if (!ev) return;
    switch (ev.type) {
      case "session_ready": {
        if (s.timer) clearTimeout(s.timer);
        s.timer = null;
        this._callId = ev.call_id;
        this.setStatus("ready");
        this.emit("ready", {
          callId: ev.call_id,
          agentId: ev.agent_id,
          agentVersionId: ev.agent_version_id
        });
        s.pending?.resolve();
        s.pending = null;
        break;
      }
      case "audio_output": {
        const pcm = this.decoder.decode(ev.audio);
        s.playback?.enqueue(pcm);
        break;
      }
      case "audio_output_clear": {
        s.playback?.clear();
        this.decoder.reset();
        this.emit("barge_in", {});
        this.updateSpeaking();
        break;
      }
      case "turn_started": {
        this.turns.set(ev.turn, { role: ev.role, text: "", startTime: ev.start_time });
        this.emit("turn_started", { turn: ev.turn, role: ev.role, startTime: ev.start_time });
        this.updateSpeaking();
        break;
      }
      case "turn_output_text_delta": {
        const t = this.turns.get(ev.turn) ?? { role: ev.role, text: "", startTime: 0 };
        t.text += ev.text;
        this.turns.set(ev.turn, t);
        this.emit("turn_delta", { turn: ev.turn, text: ev.text, fullText: t.text });
        this.emit("transcript", { turn: ev.turn, role: t.role, text: t.text, final: false });
        break;
      }
      case "turn_ended": {
        this.turns.delete(ev.turn);
        this.emit("turn_ended", {
          turn: ev.turn,
          role: ev.role,
          text: ev.text,
          interrupted: ev.interrupted,
          startTime: ev.start_time,
          endTime: ev.end_time,
          toolCalls: ev.tool_calls ?? [],
          synthetic: false
        });
        this.emit("transcript", {
          turn: ev.turn,
          role: ev.role,
          text: ev.text,
          final: true,
          interrupted: ev.interrupted
        });
        this.updateSpeaking();
        break;
      }
      case "client_tool_call":
        this.onToolCall(s, ev);
        break;
      case "error": {
        this.emit("error", {
          code: ev.code,
          message: ev.message,
          fatal: ev.fatal,
          source: "server"
        });
        if (ev.fatal) {
          if (s.pending) {
            this.fail(s, new CartesiaAgentError(ev.code, ev.message), false);
          } else if (!s.fatalTimer) {
            s.fatalTimer = setTimeout(() => this.teardown(s, 1e3, "fatal error"), FATAL_FALLBACK_MS);
          }
        }
        break;
      }
      default:
        this.emit("raw", { event: ev });
    }
  }
  onToolCall(s, ev) {
    const respond = (result, o = {}) => {
      if (!ev.expects_response || this.answered.has(ev.tool_call_id)) return;
      this.answered.add(ev.tool_call_id);
      this.sendRaw(
        s,
        encodeClientEvent({
          type: "client_tool_result",
          tool_call_id: ev.tool_call_id,
          result: truncateToolResult(result),
          ...o.isError ? { is_error: true } : {},
          ...o.errorType ? { error_type: truncateUtf8(o.errorType, MAX_ERROR_TYPE_BYTES) } : {}
        })
      );
    };
    this.emit("client_tool_call", {
      toolCallId: ev.tool_call_id,
      toolName: ev.tool_name,
      parameters: ev.parameters ?? {},
      expectsResponse: ev.expects_response,
      respond
    });
    const handler = this.opts.tools?.[ev.tool_name];
    if (!handler) return;
    void (async () => {
      try {
        const out = await handler(ev.parameters ?? {});
        respond(typeof out === "string" ? out : JSON.stringify(out ?? null) ?? "null");
      } catch (err) {
        respond(err instanceof Error ? err.message : String(err), {
          isError: true,
          errorType: err instanceof Error ? err.name : "Error"
        });
      }
    })();
  }
  sendRaw(s, frame) {
    if (s.done || !s.ws || s.ws.readyState !== OPEN) return;
    s.ws.send(frame);
  }
  sendToolResult(id, result, opts = {}) {
    const s = this.session;
    if (!s || this._status !== "ready") return;
    this.sendRaw(
      s,
      encodeClientEvent({
        type: "client_tool_result",
        tool_call_id: id,
        result: truncateToolResult(result),
        ...opts.isError ? { is_error: true } : {},
        ...opts.errorType ? { error_type: truncateUtf8(opts.errorType, MAX_ERROR_TYPE_BYTES) } : {}
      })
    );
  }
  /** Keeps sending silence while muted, so the server's 120 s idle timer never fires. */
  setMuted(muted) {
    this._muted = muted;
    this.session?.capture?.setMuted(muted);
  }
  updateSpeaking() {
    const userOpen = [...this.turns.values()].some((t) => t.role === "user");
    const who = userOpen ? "user" : this.session?.playback?.playing ? "agent" : "none";
    if (who === this.lastSpeaking) return;
    this.lastSpeaking = who;
    this.emit("speaking", { who });
  }
  onSocketClose(s, code, reason) {
    if (s.done) {
      s.closeWaiters.splice(0).forEach((f) => f());
      return;
    }
    const err = s.pending ? new CartesiaAgentError("closed", describeCloseCode(code), { closeCode: code }) : null;
    this.teardown(s, code, reason, err, true);
  }
  fail(s, err, emitError = true) {
    if (s.done) return;
    if (emitError) {
      this.emit("error", { code: err.code, message: err.message, fatal: true, source: "client" });
    }
    this.setStatus("error");
    this.teardown(s, 1e3, "client error", err, false);
  }
  /**
   * Single exit path. Idempotent per session. `socketClosed` is true when the
   * server already closed the socket, so we only report it.
   */
  teardown(s, code, reason, err = null, socketClosed = false) {
    if (s.done) return;
    s.done = true;
    if (s.timer) clearTimeout(s.timer);
    if (s.fatalTimer) clearTimeout(s.fatalTimer);
    for (const [turn, t] of this.turns) {
      this.emit("turn_ended", {
        turn,
        role: t.role,
        text: t.text,
        interrupted: true,
        startTime: t.startTime,
        endTime: t.startTime,
        toolCalls: [],
        synthetic: true
      });
      this.emit("transcript", { turn, role: t.role, text: t.text, final: true, interrupted: true });
    }
    this.turns.clear();
    try {
      s.playback?.dispose();
    } catch {
    }
    try {
      s.capture?.stop();
    } catch {
    }
    void s.ctx?.close?.().catch?.(() => {
    });
    const ws = s.ws;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      if (!socketClosed) {
        try {
          ws.close(1e3, "session completed");
        } catch {
        }
      }
    }
    this.updateSpeaking();
    if (this._status !== "error") this.setStatus("closed");
    if (ws) {
      this.emit("close", {
        code,
        reason,
        clean: code === 1e3
      });
    }
    if (s.pending) {
      s.pending.reject(err ?? new CartesiaAgentError("closed", "The session was closed."));
      s.pending = null;
    }
    s.closeWaiters.splice(0).forEach((f) => f());
  }
  /** Idempotent. Closes with 1000 and releases the mic and the AudioContext. */
  stop(reason = "session completed") {
    const s = this.session;
    if (!s || s.done) return Promise.resolve();
    if (this.stopping) return this.stopping;
    if (this._status === "connecting") {
      this.teardown(s, 1e3, reason, new CartesiaAgentError("closed", "Stopped before ready."));
      return Promise.resolve();
    }
    this.setStatus("closing");
    this.stopping = new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.teardown(s, 1e3, reason);
        resolve();
      }, STOP_WAIT_MS);
      s.closeWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
      const ws = s.ws;
      if (!ws || ws.readyState !== OPEN) {
        clearTimeout(timer);
        this.teardown(s, 1e3, reason);
        resolve();
        return;
      }
      try {
        ws.close(1e3, reason);
      } catch {
      }
    });
    return this.stopping;
  }
};
export {
  AGENTS_API_VERSION,
  AGENTS_WS_BASE,
  CartesiaAgentClient,
  CartesiaAgentError,
  Chunker,
  MAX_ERROR_TYPE_BYTES,
  MAX_TOOL_RESULT_BYTES,
  PcmDecoder,
  PlaybackQueue,
  Resampler,
  base64ToBytes,
  buildAgentUrl,
  bytesToBase64,
  describeCloseCode,
  encodeAudioInput,
  encodeClientEvent,
  encodeSessionCreate,
  floatToInt16,
  getMicStream,
  int16ToBase64,
  int16ToFloat,
  parseServerEvent,
  redactToken,
  startCapture,
  truncateToolResult,
  truncateUtf8
};
