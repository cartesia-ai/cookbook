import type { Capture, CaptureOptions } from '../src/audio/capture';
import type { PlaybackLike, WebSocketLike } from '../src/client';

export class FakeSource {
  started: number | null = null;
  stopped = false;
  disconnected = false;
  onended: (() => void) | null = null;
  buffer: { length: number; sampleRate: number } | null = null;
  connect() {}
  start(when: number) {
    this.started = when;
  }
  stop() {
    this.stopped = true;
  }
  disconnect() {
    this.disconnected = true;
  }
  end() {
    this.onended?.();
  }
}

export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  state = 'running';
  destination = {};
  sources: FakeSource[] = [];
  closed = false;
  createBuffer(_ch: number, length: number, sampleRate: number) {
    return { length, sampleRate, copyToChannel() {} };
  }
  createBufferSource() {
    const s = new FakeSource();
    const ctx = this;
    ctx.sources.push(s);
    return Object.defineProperty(s, 'buffer', {
      set(b) {
        (s as { _b?: unknown })._b = b;
      },
      get() {
        return (s as { _b?: unknown })._b;
      },
    });
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
  addEventListener() {}
}

export class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  closedWith: { code?: number; reason?: string } | null = null;
  onopen: WebSocketLike['onopen'] = null;
  onmessage: WebSocketLike['onmessage'] = null;
  onclose: WebSocketLike['onclose'] = null;
  onerror: WebSocketLike['onerror'] = null;
  constructor(readonly url: string) {}
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number, reason?: string) {
    this.closedWith = { code, reason };
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  message(event: unknown) {
    this.onmessage?.({ data: typeof event === 'string' ? event : JSON.stringify(event) });
  }
  serverClose(code = 1000, reason = '') {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
  frames() {
    return this.sent.map((s) => JSON.parse(s));
  }
}

export class FakePlayback implements PlaybackLike {
  chunks: Int16Array[] = [];
  log: string[];
  playing = false;
  bufferedMs = 0;
  disposed = false;
  constructor(log: string[]) {
    this.log = log;
  }
  enqueue(pcm: Int16Array) {
    this.chunks.push(pcm);
    this.playing = true;
  }
  clear() {
    this.log.push('clear');
    this.chunks = [];
    this.playing = false;
  }
  dispose() {
    this.disposed = true;
    this.playing = false;
  }
}

export function makeHarness(over: Record<string, unknown> = {}) {
  const log: string[] = [];
  const sockets: FakeWebSocket[] = [];
  const ctx = new FakeAudioContext();
  let playback!: FakePlayback;
  let onChunk!: (p: Int16Array) => void;
  const capture: Capture & { muted: boolean; stopped: boolean } = {
    muted: false,
    stopped: false,
    setMuted(m) {
      this.muted = m;
    },
    stop() {
      this.stopped = true;
    },
  };
  const options = {
    agentId: 'agent_1',
    getToken: async () => 'tok_fake',
    webSocketFactory: (url: string) => {
      const ws = new FakeWebSocket(url);
      sockets.push(ws);
      return ws;
    },
    audioContextFactory: () => ctx as unknown as AudioContext,
    captureFactory: async (o: CaptureOptions) => {
      onChunk = o.onChunk;
      return capture;
    },
    playbackFactory: () => {
      playback = new FakePlayback(log);
      return playback;
    },
    ...over,
  };
  return {
    options,
    log,
    sockets,
    ctx,
    capture,
    get playback() {
      return playback;
    },
    mic: (p: Int16Array) => onChunk(p),
  };
}

export const READY = {
  type: 'session_ready',
  call_id: 'call_1',
  agent_id: 'agent_1',
  agent_version_id: 'v1',
  audio: { input_format: 'pcm_16000', output_delivery: 'as_available' },
};
