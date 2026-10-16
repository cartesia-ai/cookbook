import { SAMPLE_RATE } from "./config";

const BYTES_PER_SAMPLE = 2;

export function pcmDuration(bytes: number, sampleRate = SAMPLE_RATE): number {
  return bytes / BYTES_PER_SAMPLE / sampleRate;
}

export function silence(ms: number, sampleRate = SAMPLE_RATE): Uint8Array {
  return new Uint8Array(Math.round((ms / 1000) * sampleRate) * BYTES_PER_SAMPLE);
}

export function wavHeader(dataLength: number, sampleRate = SAMPLE_RATE, channels = 1, bitDepth = 16): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) header[offset + i] = text.charCodeAt(i);
  };
  const blockAlign = (channels * bitDepth) / 8;
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  ascii(36, "data");
  view.setUint32(40, dataLength, true);
  return header;
}

export function concatPcm(parts: Uint8Array[], gapsMs: number[]): { pcm: Uint8Array; starts: number[]; duration: number } {
  const pieces: Uint8Array[] = [];
  const starts: number[] = [];
  let bytes = 0;
  parts.forEach((part, i) => {
    if (i > 0) {
      const gap = silence(gapsMs[i] ?? 0);
      pieces.push(gap);
      bytes += gap.byteLength;
    }
    starts.push(pcmDuration(bytes));
    pieces.push(part);
    bytes += part.byteLength;
  });
  const pcm = new Uint8Array(bytes);
  let offset = 0;
  for (const p of pieces) {
    pcm.set(p, offset);
    offset += p.byteLength;
  }
  return { pcm, starts, duration: pcmDuration(bytes) };
}

export function toWav(pcm: Uint8Array): Uint8Array {
  const out = new Uint8Array(44 + pcm.byteLength);
  out.set(wavHeader(pcm.byteLength), 0);
  out.set(pcm, 44);
  return out;
}

export function activeLineIndex(starts: number[], time: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= time) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
