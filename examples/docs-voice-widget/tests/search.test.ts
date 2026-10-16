import { describe, expect, it } from 'vitest';
import { normalize } from '../server/embeddings';
import { KEYWORD_MODEL } from '../server/keyword';
import { RESULT_BUDGET_BYTES, SAME_PAGE_BOOST, boostSamePage, packResults, samePage, searchDocs } from '../server/search';
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

describe('keyword search', () => {
  const empty = new Float32Array(0);
  const index = new DocIndex(KEYWORD_MODEL, 0);
  index.chunks = [
    chunk('size', '/docs/client-tools', empty, 'A client tool result can be at most 4096 bytes.'),
    chunk('auth', '/docs/auth', empty, 'Mint an access token on your server with the agent grant.'),
    chunk('hooks', '/docs/webhooks', empty, 'Webhook tools call your public HTTPS endpoint with a result.'),
  ];
  const embed = async () => {
    throw new Error('keyword search must not embed');
  };

  it('ranks by matching terms without calling the embedder', async () => {
    const out = JSON.parse((await searchDocs(index, embed, 'How big can a client tool result be?')).result);
    expect(out.results[0].source_id).toBe('size');
    expect(out.results.map((r: { source_id: string }) => r.source_id)).not.toContain('auth');
  });

  it('says so when no term matches', async () => {
    expect(JSON.parse((await searchDocs(index, embed, 'pricing')).result).results).toEqual([]);
  });
});

describe('boostSamePage', () => {
  const empty = new Float32Array(0);
  const rank = (scale: number) =>
    boostSamePage(
      [
        { chunk: chunk('top', '/other', empty), score: 1 * scale },
        { chunk: chunk('here', '/docs/page', empty), score: (1 - SAME_PAGE_BOOST / 2) * scale },
        { chunk: chunk('low', '/docs/page', empty), score: (1 - SAME_PAGE_BOOST * 2) * scale },
      ],
      '/docs/page',
      3,
    ).map((r) => r.chunk.id);

  it('moves a close section on the current page up the same way at any score scale', () => {
    expect(rank(0.42)).toEqual(['here', 'top', 'low']);
    expect(rank(17.3)).toEqual(['here', 'top', 'low']);
  });

  it('boosts keyword results on the current page', async () => {
    const index = new DocIndex(KEYWORD_MODEL, 0);
    const text = 'Webhook tools call your public endpoint over HTTPS, wait for a short JSON result, retry on network errors and back off between attempts so slow servers recover.';
    index.chunks = [
      chunk('p', '/docs/p', empty, text),
      chunk('q', '/docs/q', empty, `${text} today`),
      chunk('c', '/docs/c', empty, 'Client tools run in the browser.'),
    ];
    const embed = async () => [empty];
    const plain = JSON.parse((await searchDocs(index, embed, 'webhook')).result);
    expect(plain.results[0].source_id).toBe('p');
    const here = JSON.parse((await searchDocs(index, embed, 'webhook', '/docs/q')).result);
    expect(here.results[0].source_id).toBe('q');
  });
});
