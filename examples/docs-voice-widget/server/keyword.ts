import type { Chunk } from './store';

export const KEYWORD_MODEL = 'keyword-bm25';

const K1 = 1.2;
const B = 0.75;
const STOP = new Set(
  'a an and are as at be by can do does for from how i if in is it its of on or so that the this to what when where which who why with you your'.split(' '),
);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).filter((t) => !STOP.has(t));
}

interface Stats {
  docs: Map<string, number>[];
  lengths: number[];
  avgLength: number;
  df: Map<string, number>;
}

const cache = new WeakMap<Chunk[], Stats>();

function stats(chunks: Chunk[]): Stats {
  const hit = cache.get(chunks);
  if (hit) return hit;
  const df = new Map<string, number>();
  const docs = chunks.map((c) => {
    const tf = new Map<string, number>();
    for (const t of tokenize(`${c.title} ${c.heading} ${c.text}`)) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return tf;
  });
  const lengths = docs.map((tf) => [...tf.values()].reduce((a, b) => a + b, 0));
  const avgLength = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1) || 1;
  const s = { docs, lengths, avgLength, df };
  cache.set(chunks, s);
  return s;
}

export function keywordSearch(
  chunks: Chunk[],
  query: string,
  k: number,
): Array<{ chunk: Chunk; score: number }> {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0 || chunks.length === 0) return [];
  const { docs, lengths, avgLength, df } = stats(chunks);
  const n = chunks.length;
  const raw = chunks.map((chunk, i) => {
    let score = 0;
    for (const t of terms) {
      const f = docs[i]!.get(t);
      if (!f) continue;
      const d = df.get(t)!;
      const idf = Math.log(1 + (n - d + 0.5) / (d + 0.5));
      score += (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * lengths[i]!) / avgLength));
    }
    return { chunk, score };
  });
  return raw
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
