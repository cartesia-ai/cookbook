import { describe, expect, it } from 'vitest';
import {
  Chunker,
  PcmDecoder,
  Resampler,
  base64ToBytes,
  bytesToBase64,
  floatToInt16,
  int16ToBytes,
  int16ToFloat,
  samplesForChunk,
} from '../src/audio/pcm';

function sine(rate: number, freq: number, seconds: number): Float32Array {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

function inBlocks(r: Resampler, input: Float32Array, size: number): Float32Array {
  const parts: Float32Array[] = [];
  for (let i = 0; i < input.length; i += size) parts.push(r.process(input.subarray(i, i + size)));
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function zeroCrossings(x: Float32Array): number {
  let n = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1]! < 0 !== x[i]! < 0) n++;
  return n;
}

describe('float and int16', () => {
  it('handles edge values', () => {
    const out = floatToInt16(new Float32Array([1, -1, 0, 2, -2, NaN, 0.5]));
    expect([...out]).toEqual([32767, -32768, 0, 32767, -32768, 0, 16384]);
  });
  it('round-trips within 1 LSB', () => {
    const src = sine(16000, 440, 0.1);
    const back = int16ToFloat(floatToInt16(src));
    for (let i = 0; i < src.length; i++) expect(Math.abs(back[i]! - src[i]!)).toBeLessThan(2 / 32767);
  });
});

describe('Resampler', () => {
  it('passes through at the same rate', () => {
    const x = sine(16000, 100, 0.05);
    expect(new Resampler(16000, 16000).process(x)).toBe(x);
  });
  it('48k to 16k keeps frequency and length', () => {
    const x = sine(48000, 440, 1);
    const y = inBlocks(new Resampler(48000, 16000), x, 128);
    expect(Math.abs(y.length - 16000)).toBeLessThanOrEqual(1);
    expect(Math.abs(zeroCrossings(y) - 880)).toBeLessThanOrEqual(2);
  });
  it('block size does not change the output', () => {
    const x = sine(48000, 300, 0.5);
    const big = new Resampler(48000, 16000).process(x);
    const small = inBlocks(new Resampler(48000, 16000), x, 128);
    expect(small.length).toBe(big.length);
    for (let i = 0; i < big.length; i++) expect(small[i]!).toBeCloseTo(big[i]!, 5);
  });
  it('44.1k to 16k fractional block carry matches one big block', () => {
    const x = sine(44100, 500, 1);
    const big = new Resampler(44100, 16000).process(x);
    const small = inBlocks(new Resampler(44100, 16000), x, 128);
    expect(Math.abs(big.length - 16000)).toBeLessThanOrEqual(1);
    expect(small.length).toBe(big.length);
    for (let i = 0; i < big.length; i++) expect(small[i]!).toBeCloseTo(big[i]!, 5);
  });
  it('upsamples with linear interpolation', () => {
    const y = new Resampler(8000, 16000).process(new Float32Array([0, 1, 0, 1]));
    expect(y.length).toBeGreaterThanOrEqual(5);
    expect(y[1]).toBeCloseTo(0.5);
  });
});

describe('Chunker', () => {
  it('emits exact sizes and keeps the remainder', () => {
    const c = new Chunker(4);
    expect(c.push(new Int16Array([1, 2, 3])).length).toBe(0);
    const out = c.push(new Int16Array([4, 5, 6, 7, 8, 9]));
    expect(out.map((a) => [...a])).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
    expect([...c.flush()]).toEqual([9]);
    expect(c.flush().length).toBe(0);
  });
  it('computes samples per chunk and validates range', () => {
    expect(samplesForChunk(16000, 40)).toBe(640);
    expect(() => samplesForChunk(16000, 10)).toThrow();
    expect(() => samplesForChunk(16000, 200)).toThrow();
  });
});

describe('base64', () => {
  it('round-trips 1 MB without a stack overflow', () => {
    const bytes = new Uint8Array(1_000_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 255;
    const back = base64ToBytes(bytesToBase64(bytes));
    expect(back.length).toBe(bytes.length);
    expect(back[999_999]).toBe(999_999 & 255);
  });
  it('carries an odd trailing byte into the next chunk', () => {
    const all = int16ToBytes(new Int16Array([100, -200, 300]));
    const d = new PcmDecoder();
    const a = d.decode(bytesToBase64(all.subarray(0, 3)));
    const b = d.decode(bytesToBase64(all.subarray(3)));
    expect([...a, ...b]).toEqual([100, -200, 300]);
  });
});
