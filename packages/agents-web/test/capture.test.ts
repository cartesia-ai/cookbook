import { describe, expect, it, vi } from 'vitest';
import { startCapture } from '../src/audio/capture';

function fakeStream() {
  const track = { stop: vi.fn() };
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream };
}

function fakeContext(over: Record<string, unknown> = {}) {
  return {
    sampleRate: 48000,
    audioWorklet: { addModule: async () => {} },
    createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
    destination: {},
    ...over,
  } as unknown as AudioContext;
}

describe('startCapture', () => {
  it('stops the mic tracks when the source node cannot be created', async () => {
    const { track, stream } = fakeStream();
    const ctx = fakeContext({
      createMediaStreamSource: () => {
        throw new Error('NotSupportedError');
      },
    });
    await expect(
      startCapture({ audioContext: ctx, targetRate: 16000, chunkMs: 40, onChunk() {}, stream }),
    ).rejects.toMatchObject({ code: 'mic_unavailable' });
    expect(track.stop).toHaveBeenCalled();
  });

  it('stops the mic tracks when the worklet node cannot be created', async () => {
    const { track, stream } = fakeStream();
    vi.stubGlobal(
      'AudioWorkletNode',
      class {
        constructor() {
          throw new Error('InvalidStateError');
        }
      },
    );
    try {
      await expect(
        startCapture({ audioContext: fakeContext(), targetRate: 16000, chunkMs: 40, onChunk() {}, stream }),
      ).rejects.toMatchObject({ code: 'mic_unavailable' });
      expect(track.stop).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
