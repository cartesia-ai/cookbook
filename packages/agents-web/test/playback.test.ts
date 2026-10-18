import { describe, expect, it, vi } from 'vitest';
import { PlaybackQueue } from '../src/audio/playback';
import { FakeAudioContext } from './fakes';

const RATE = 16000;
const pcm = (ms: number) => new Int16Array((RATE * ms) / 1000);

function setup(opts: { prerollMs?: number; maxQueueMs?: number; clock?: () => number } = {}) {
  const ctx = new FakeAudioContext();
  const onIdle = vi.fn();
  const onStart = vi.fn();
  const onOverflow = vi.fn();
  const q = new PlaybackQueue(ctx as unknown as AudioContext, {
    sampleRate: RATE,
    prerollMs: 80,
    onIdle,
    onStart,
    onOverflow,
    ...opts,
  });
  return { ctx, q, onIdle, onStart, onOverflow };
}

describe('PlaybackQueue', () => {
  it('starts the first chunk after the pre-roll', () => {
    const { ctx, q, onStart } = setup();
    ctx.currentTime = 10;
    q.enqueue(pcm(100));
    expect(ctx.sources[0]!.started).toBeCloseTo(10.08);
    expect(onStart).toHaveBeenCalledOnce();
    expect(q.playing).toBe(true);
  });

  it('schedules the next chunk exactly at the end of the previous one', () => {
    const { ctx, q } = setup();
    ctx.currentTime = 1;
    q.enqueue(pcm(100));
    q.enqueue(pcm(50));
    expect(ctx.sources[1]!.started).toBeCloseTo(ctx.sources[0]!.started! + 0.1, 9);
    expect(q.bufferedMs).toBeCloseTo(80 + 150, 3);
  });

  it('gets a fresh pre-roll after the queue drained', () => {
    const { ctx, q, onIdle } = setup();
    ctx.currentTime = 1;
    q.enqueue(pcm(100));
    ctx.currentTime = 2;
    ctx.sources[0]!.end();
    expect(onIdle).toHaveBeenCalledOnce();
    q.enqueue(pcm(100));
    expect(ctx.sources[1]!.started).toBeCloseTo(2.08);
  });

  it('never schedules in the past after an underrun', () => {
    const { ctx, q } = setup();
    ctx.currentTime = 1;
    q.enqueue(pcm(100));
    ctx.currentTime = 5;
    q.enqueue(pcm(100));
    expect(ctx.sources[1]!.started!).toBeGreaterThanOrEqual(5.08 - 1e-9);
  });

  it('clear() stops every live source and resets', () => {
    const { ctx, q, onIdle } = setup();
    q.enqueue(pcm(100));
    q.enqueue(pcm(100));
    q.enqueue(pcm(100));
    q.clear();
    expect(ctx.sources.every((s) => s.stopped && s.disconnected)).toBe(true);
    expect(q.bufferedMs).toBe(0);
    expect(q.playing).toBe(false);
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it('clear() on an empty queue is quiet', () => {
    const { q, onIdle } = setup();
    q.clear();
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('plays audio enqueued after clear() with a fresh pre-roll', () => {
    const { ctx, q } = setup();
    ctx.currentTime = 3;
    q.enqueue(pcm(500));
    q.clear();
    ctx.currentTime = 3.01;
    q.enqueue(pcm(100));
    expect(ctx.sources[1]!.started).toBeCloseTo(3.09);
    expect(q.playing).toBe(true);
  });

  it('a late ended from a stopped source does not fire idle', () => {
    const { ctx, q, onIdle } = setup();
    q.enqueue(pcm(100));
    const old = ctx.sources[0]!;
    const handler = old.onended;
    q.clear();
    onIdle.mockClear();
    q.enqueue(pcm(100));
    handler?.();
    old.end();
    expect(onIdle).not.toHaveBeenCalled();
    expect(q.playing).toBe(true);
  });

  it('keeps a long reply that arrives faster than real time', () => {
    const wall = { ms: 0 };
    const { ctx, q, onOverflow } = setup({ clock: () => wall.ms });
    ctx.currentTime = 0;
    for (let i = 0; i < 45; i++) q.enqueue(pcm(1000));
    expect(onOverflow).not.toHaveBeenCalled();
    expect(ctx.sources.some((s) => s.stopped)).toBe(false);
    expect(q.bufferedMs).toBeCloseTo(45080, 3);
  });

  it('drops unplayed backlog past maxQueueMs when the context stalls', () => {
    const wall = { ms: 0 };
    const { ctx, q, onOverflow } = setup({ maxQueueMs: 1000, clock: () => wall.ms });
    ctx.currentTime = 0;
    for (let i = 0; i < 12; i++) {
      q.enqueue(pcm(100));
      wall.ms += 500;
    }
    expect(onOverflow).toHaveBeenCalled();
    expect(q.bufferedMs).toBeLessThanOrEqual(1000);
    expect(ctx.sources.some((s) => s.stopped)).toBe(true);
  });

  it('does not trim while the context keeps up with wall clock', () => {
    const wall = { ms: 0 };
    const { ctx, q, onOverflow } = setup({ maxQueueMs: 1000, clock: () => wall.ms });
    for (let i = 0; i < 30; i++) {
      q.enqueue(pcm(100));
      wall.ms += 50;
      ctx.currentTime += 0.05;
    }
    expect(onOverflow).not.toHaveBeenCalled();
  });
});
