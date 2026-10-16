import { describe, expect, it } from 'vitest';
import { CAPTURE_PROCESSOR_NAME, CAPTURE_WORKLET_SOURCE } from '../../lib/agents-web/audio/worklet-source';

function load() {
  let registered: { name: string; cls: new () => { port: { postMessage: (...a: unknown[]) => void }; process(i: Float32Array[][]): boolean } } | null = null;
  class AudioWorkletProcessor {
    port = { postMessage: (..._a: unknown[]) => {} };
  }
  const fn = new Function(
    'AudioWorkletProcessor',
    'registerProcessor',
    CAPTURE_WORKLET_SOURCE,
  );
  fn(AudioWorkletProcessor, (name: string, cls: never) => {
    registered = { name, cls };
  });
  return registered!;
}

describe('capture worklet source', () => {
  it('registers under the expected name', () => {
    expect(load().name).toBe(CAPTURE_PROCESSOR_NAME);
  });
  it('posts a copy of channel 0 and keeps running', () => {
    const { cls } = load();
    const p = new cls();
    const posted: Array<[Float32Array, unknown[]]> = [];
    p.port.postMessage = (data: unknown, transfer: unknown) =>
      posted.push([data as Float32Array, transfer as unknown[]]);
    const block = new Float32Array([0.1, 0.2, 0.3]);
    expect(p.process([[block]])).toBe(true);
    expect([...posted[0]![0]]).toEqual([...block]);
    expect(posted[0]![0]).not.toBe(block);
    expect(posted[0]![1]).toHaveLength(1);
  });
  it('ignores empty input without throwing', () => {
    const { cls } = load();
    const p = new cls();
    let n = 0;
    p.port.postMessage = () => n++;
    expect(p.process([])).toBe(true);
    expect(p.process([[]])).toBe(true);
    expect(n).toBe(0);
  });
});
