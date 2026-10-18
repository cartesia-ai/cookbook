import { describe, expect, it } from "vitest";
import { activeLineIndex, concatPcm, pcmDuration, toWav, wavHeader } from "@/lib/wav";

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

describe("wavHeader", () => {
  it("writes a 44-byte PCM header for 24 kHz mono 16-bit", () => {
    const h = wavHeader(1000);
    const v = new DataView(h.buffer);
    expect(h.byteLength).toBe(44);
    expect(ascii(h, 0, 4)).toBe("RIFF");
    expect(v.getUint32(4, true)).toBe(1036);
    expect(ascii(h, 8, 12)).toBe("WAVE");
    expect(ascii(h, 12, 16)).toBe("fmt ");
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(24000);
    expect(v.getUint32(28, true)).toBe(48000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(ascii(h, 36, 40)).toBe("data");
    expect(v.getUint32(40, true)).toBe(1000);
  });
});

describe("concatPcm", () => {
  const second = new Uint8Array(48000);
  it("computes start times from durations plus gaps", () => {
    const a = new Uint8Array(24000);
    const { pcm, starts, duration } = concatPcm([a, second, a], [0, 350, 180]);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBeCloseTo(0.5 + 0.35, 6);
    expect(starts[2]).toBeCloseTo(0.5 + 0.35 + 1 + 0.18, 6);
    expect(duration).toBeCloseTo(0.5 + 0.35 + 1 + 0.18 + 0.5, 6);
    expect(pcm.byteLength).toBe(Math.round(duration * 48000));
  });
  it("total length matches the WAV body", () => {
    const { pcm } = concatPcm([second, second], [0, 180]);
    const wav = toWav(pcm);
    expect(wav.byteLength).toBe(44 + pcm.byteLength);
    expect(pcmDuration(pcm.byteLength)).toBeCloseTo(2.18, 6);
  });
});

describe("activeLineIndex", () => {
  const starts = [0.2, 2, 5];
  it("is -1 before the first line", () => expect(activeLineIndex(starts, 0.1)).toBe(-1));
  it("switches exactly at a boundary", () => {
    expect(activeLineIndex(starts, 2)).toBe(1);
    expect(activeLineIndex(starts, 1.999)).toBe(0);
  });
  it("stays on a line between starts", () => expect(activeLineIndex(starts, 3.5)).toBe(1));
  it("stays on the last line past the end", () => expect(activeLineIndex(starts, 999)).toBe(2));
  it("handles no lines", () => expect(activeLineIndex([], 1)).toBe(-1));
});
