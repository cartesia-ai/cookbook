export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 512;

export type Embedder = (texts: string[]) => Promise<Float32Array[]>;

export class EmbeddingError extends Error {}

export function openAIEmbedder(apiKey: string | undefined, fetchImpl: typeof fetch = fetch): Embedder {
  return async (texts) => {
    if (!apiKey) throw new EmbeddingError('OPENAI_API_KEY is not set.');
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += 64) {
      const batch = texts.slice(i, i + 64);
      const res = await fetchImpl('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch, dimensions: EMBEDDING_DIMENSIONS }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new EmbeddingError(`OpenAI embeddings answered ${res.status}.`);
      const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
      const sorted = [...json.data].sort((a, b) => a.index - b.index);
      for (const d of sorted) out.push(normalize(Float32Array.from(d.embedding)));
    }
    return out;
  };
}

export function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i]! * v[i]!;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] = v[i]! / n;
  return v;
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

export function encodeVector(v: Float32Array): string {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64');
}

export function decodeVector(s: string): Float32Array {
  const buf = Buffer.from(s, 'base64');
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return new Float32Array(copy.buffer);
}
