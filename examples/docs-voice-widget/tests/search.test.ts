import { describe, expect, it } from 'vitest';
import { normalize } from '../server/embeddings';
import { RESULT_BUDGET_BYTES, packResults, samePage, searchDocs } from '../server/search';
import { DocIndex, type Chunk } from '../server/store';

const vec = (...xs: number[]) => normalize(Float32Array.from(xs));
const chunk = (id: string, url: string, v: Float32Array, text = 'text'): Chunk => ({
  id, url, title: `T ${id}`, heading: `H ${id}`, anchor: id, text, vector: v,
});

describe('packResults', () => {
  it('fits the 4096-byte tool result cap and keeps rank order', () => {
    const long = 'é'.repeat(3000);
    const ranked = ['a', 'b', 'c', 'd'].map((id, i) => ({ chunk: chunk(id, '/x', vec(1, 0), long), score: 1 - i / 10 }));
    const { result, sources } = packResults(ranked, '/x');
    expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(RESULT_BUDGET_BYTES);
    const parsed = JSON.parse(result) as { results: { source_id: string; on_this_page: boolean }[] };
    expect(parsed.results.map((r) => r.source_id)).toEqual(Object.keys(sources));
    expect(parsed.results[0]!.source_id).toBe('a');
    expect(parsed.results[0]!.on_this_page).toBe(true);
  });

  it('says so when nothing matched', () => {
    expect(JSON.parse(packResults([], undefined).result)).toEqual({ results: [], note: 'No matching docs.' });
  });
});

describe('searchDocs', () => {
  it('ranks by similarity and nudges sections on the current page', async () => {
    const index = new DocIndex('m', 2);
    index.chunks = [chunk('near', '/other', vec(1, 0.1)), chunk('here', '/docs/page', vec(1, 0.15)), chunk('far', '/other', vec(0, 1))];
    const embed = async () => [vec(1, 0)];
    const plain = JSON.parse((await searchDocs(index, embed, 'q')).result);
    expect(plain.results[0].source_id).toBe('near');
    const boosted = JSON.parse((await searchDocs(index, embed, 'q', '/docs/page/')).result);
    expect(boosted.results[0].source_id).toBe('here');
  });

  it('compares pages by path only', () => {
    expect(samePage('https://site.com/docs/a#x', '/docs/a/')).toBe(true);
    expect(samePage('/docs/a', '/docs/b')).toBe(false);
  });
});
