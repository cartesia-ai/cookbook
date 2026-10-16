import type { Embedder } from './embeddings';
import { KEYWORD_MODEL, keywordSearch } from './keyword';
import type { Chunk, DocIndex } from './store';

export const RESULT_BUDGET_BYTES = 3800;
export const TOP_K = 4;
export const SAME_PAGE_BOOST = 0.03;
export const MAX_QUERY_CHARS = 300;
export const CANDIDATES = 50;

export interface Source {
  title: string;
  heading: string;
  url: string;
  anchor: string;
}

export interface SearchResponse {
  result: string;
  sources: Record<string, Source>;
}

const byteLength = (s: string) => new TextEncoder().encode(s).length;

export function samePage(url: string, page: string | undefined): boolean {
  if (!page) return false;
  const strip = (u: string) => u.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
  try {
    return strip(new URL(url, 'http://x').pathname) === strip(new URL(page, 'http://x').pathname);
  } catch {
    return false;
  }
}

export function packResults(
  ranked: Array<{ chunk: Chunk; score: number }>,
  page: string | undefined,
  budget = RESULT_BUDGET_BYTES,
): SearchResponse {
  const sources: Record<string, Source> = {};
  const items = ranked.map(({ chunk }) => {
    sources[chunk.id] = { title: chunk.title, heading: chunk.heading, url: chunk.url, anchor: chunk.anchor };
    return {
      source_id: chunk.id,
      page: chunk.title,
      section: chunk.heading || chunk.title,
      on_this_page: samePage(chunk.url, page),
      text: chunk.text,
    };
  });
  const render = () => JSON.stringify({ results: items });
  let out = render();
  while (byteLength(out) > budget) {
    const longest = items.reduce((a, b) => (b.text.length > a.text.length ? b : a));
    if (longest.text.length <= 80) {
      items.pop();
      if (items.length === 0) break;
    } else {
      longest.text = longest.text.slice(0, Math.floor(longest.text.length * 0.8)).trimEnd() + '...';
    }
    out = render();
  }
  for (const id of Object.keys(sources)) {
    if (!items.some((i) => i.source_id === id)) delete sources[id];
  }
  if (items.length === 0) return { result: JSON.stringify({ results: [], note: 'No matching docs.' }), sources };
  return { result: out, sources };
}

export function boostSamePage(
  ranked: Array<{ chunk: Chunk; score: number }>,
  page: string | undefined,
  k: number,
): Array<{ chunk: Chunk; score: number }> {
  if (ranked.length === 0) return [];
  const top = ranked.reduce((m, r) => (r.score > m ? r.score : m), -Infinity);
  const bump = SAME_PAGE_BOOST * Math.abs(top);
  return ranked
    .map((r) => ({ chunk: r.chunk, score: r.score + (samePage(r.chunk.url, page) ? bump : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export async function searchDocs(
  index: DocIndex,
  embed: Embedder,
  query: string,
  page?: string,
): Promise<SearchResponse> {
  const q = query.trim().slice(0, MAX_QUERY_CHARS);
  if (!q || index.chunks.length === 0) return packResults([], page);
  if (index.model === KEYWORD_MODEL) {
    return packResults(boostSamePage(keywordSearch(index.chunks, q, CANDIDATES), page, TOP_K), page);
  }
  const [vector] = await embed([q]);
  return packResults(boostSamePage(index.search(vector!, CANDIDATES), page, TOP_K), page);
}
