import { int16ToFloat } from './pcm';

export interface PlaybackOptions {
  sampleRate: number;
  prerollMs?: number;
  maxQueueMs?: number;
  onStart?: () => void;
  onIdle?: () => void;
  onOverflow?: (droppedMs: number) => void;
  clock?: () => number;
}

interface Live {
  source: AudioBufferSourceNode;
  end: number;
  start: number;
}

const STALL_MS = 1000;

export class PlaybackQueue {
  private live: Live[] = [];
  private nextStartTime = 0;
  private generation = 0;
  private disposed = false;
  private anchorWall = 0;
  private anchorCtx = 0;
  private readonly prerollMs: number;
  private readonly maxQueueMs: number;
  private readonly clock: () => number;

  constructor(
    private readonly ctx: AudioContext,
    private readonly opts: PlaybackOptions,
  ) {
    this.prerollMs = opts.prerollMs ?? 80;
    this.maxQueueMs = opts.maxQueueMs ?? 30000;
    this.clock = opts.clock ?? (() => performance.now());
  }

  get bufferedMs(): number {
    if (this.live.length === 0) return 0;
    const now = this.ctx.currentTime;
    const last = this.live[this.live.length - 1]!;
    return Math.max(0, (last.end - now) * 1000);
  }

  get playing(): boolean {
    return this.live.length > 0;
  }

  enqueue(pcm: Int16Array): void {
    if (this.disposed || pcm.length === 0) return;
    const ctx = this.ctx;
    const wasEmpty = this.live.length === 0;
    if (wasEmpty) this.setAnchor();
    this.trimOverflow((pcm.length / this.opts.sampleRate) * 1000);
    const now = ctx.currentTime;
    const earliest = now + this.prerollMs / 1000;
    if (this.live.length === 0 || this.nextStartTime < now) {
      this.nextStartTime = earliest;
    }

    const buffer = ctx.createBuffer(1, pcm.length, this.opts.sampleRate);
    buffer.copyToChannel(int16ToFloat(pcm) as Float32Array<ArrayBuffer>, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const start = this.nextStartTime;
    const end = start + pcm.length / this.opts.sampleRate;
    const entry: Live = { source, start, end };
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

  private setAnchor(): void {
    this.anchorWall = this.clock();
    this.anchorCtx = this.ctx.currentTime;
  }

  private get stalledMs(): number {
    const wall = this.clock() - this.anchorWall;
    const played = (this.ctx.currentTime - this.anchorCtx) * 1000;
    return wall - played;
  }

  private trimOverflow(incomingMs: number): void {
    if (this.bufferedMs + incomingMs <= this.maxQueueMs) return;
    if (this.stalledMs < STALL_MS) return;
    const now = this.ctx.currentTime;
    let dropped = 0;
    const keep: Live[] = [];
    for (const l of this.live) {
      if (l.start <= now) {
        keep.push(l);
        continue;
      }
      l.source.onended = null;
      try {
        l.source.stop();
      } catch {}
      l.source.disconnect();
      dropped += (l.end - l.start) * 1000;
    }
    this.live = keep;
    this.nextStartTime = keep.length ? keep[keep.length - 1]!.end : 0;
    this.setAnchor();
    if (dropped > 0) this.opts.onOverflow?.(dropped);
  }

  clear(): void {
    this.generation++;
    const hadAudio = this.live.length > 0;
    for (const { source } of this.live) {
      source.onended = null;
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    this.live = [];
    this.nextStartTime = 0;
    if (hadAudio) this.opts.onIdle?.();
  }

  dispose(): void {
    this.clear();
    this.disposed = true;
  }
}
