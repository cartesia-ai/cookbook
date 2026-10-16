export function floatToInt16(f32: Float32Array): Int16Array {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    let s = f32[i]!;
    if (Number.isNaN(s)) s = 0;
    s = s > 1 ? 1 : s < -1 ? -1 : s;
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

export function int16ToFloat(i16: Int16Array): Float32Array {
  const out = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) {
    const v = i16[i]!;
    out[i] = v < 0 ? v / 0x8000 : v / 0x7fff;
  }
  return out;
}

export class Resampler {
  private readonly ratio: number;
  private buf: number[] = [];
  private pos = 0;

  constructor(
    readonly inRate: number,
    readonly outRate: number,
  ) {
    if (!(inRate > 0) || !(outRate > 0)) throw new Error('sample rates must be positive');
    this.ratio = inRate / outRate;
  }

  process(input: Float32Array): Float32Array {
    if (this.inRate === this.outRate) return input;
    for (let i = 0; i < input.length; i++) this.buf.push(input[i]!);
    const out: number[] = [];
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
          sum += this.buf[k]! * w;
          weight += w;
        }
        out.push(weight > 0 ? sum / weight : 0);
        this.pos = end;
      }
    } else {
      while (Math.floor(this.pos) + 1 < this.buf.length) {
        const i = Math.floor(this.pos);
        const frac = this.pos - i;
        out.push(this.buf[i]! * (1 - frac) + this.buf[i + 1]! * frac);
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

  reset(): void {
    this.buf = [];
    this.pos = 0;
  }
}

export class Chunker {
  private pending = new Int16Array(0);

  constructor(readonly samplesPerChunk: number) {
    if (!Number.isInteger(samplesPerChunk) || samplesPerChunk <= 0) {
      throw new Error('samplesPerChunk must be a positive integer');
    }
  }

  push(samples: Int16Array): Int16Array[] {
    const merged = new Int16Array(this.pending.length + samples.length);
    merged.set(this.pending);
    merged.set(samples, this.pending.length);
    const chunks: Int16Array[] = [];
    let offset = 0;
    while (merged.length - offset >= this.samplesPerChunk) {
      chunks.push(merged.slice(offset, offset + this.samplesPerChunk));
      offset += this.samplesPerChunk;
    }
    this.pending = merged.slice(offset);
    return chunks;
  }

  flush(): Int16Array {
    const rest = this.pending;
    this.pending = new Int16Array(0);
    return rest;
  }
}

export function samplesForChunk(rate: number, chunkMs: number): number {
  if (chunkMs < 20 || chunkMs > 100) throw new Error('chunkMs must be between 20 and 100');
  return Math.round((rate * chunkMs) / 1000);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const slice = 0x8000;
  for (let i = 0; i < bytes.length; i += slice) {
    binary += String.fromCharCode(...bytes.subarray(i, i + slice));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function int16ToBytes(samples: Int16Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) view.setInt16(i * 2, samples[i]!, true);
  return out;
}

export function int16ToBase64(samples: Int16Array): string {
  return bytesToBase64(int16ToBytes(samples));
}

export class PcmDecoder {
  private carry: number | null = null;

  decode(b64: string): Int16Array {
    let bytes = base64ToBytes(b64);
    if (this.carry !== null) {
      const merged = new Uint8Array(bytes.length + 1);
      merged[0] = this.carry;
      merged.set(bytes, 1);
      bytes = merged;
      this.carry = null;
    }
    if (bytes.length % 2 === 1) {
      this.carry = bytes[bytes.length - 1]!;
      bytes = bytes.subarray(0, bytes.length - 1);
    }
    const out = new Int16Array(bytes.length / 2);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true);
    return out;
  }

  reset(): void {
    this.carry = null;
  }
}
