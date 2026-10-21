import { createHash } from 'node:crypto';
import type { Embedder } from '../server/embeddings';
import type { Chunk, DocIndex } from '../server/store';
import { parsePage, toPlainText } from './chunk';
import type { RawPage } from './sources';

export interface IngestStats {
  pages: number;
  embedded: number;
  skipped: number;
  removed: number;
  chunks: number;
}

const MIN_TEXT_CHARS = 40;

export function chunkId(url: string, anchor: string, part: number): string {
  return 's' + createHash('sha1').update(`${url}#${anchor}#${part}`).digest('hex').slice(0, 12);
}

export function pageChunks(page: RawPage): { title: string; checksum: string; chunks: Omit<Chunk, 'vector'>[] } {
  const parsed = parsePage(page.markdown, { anchors: page.anchors });
  const parts = new Map<string, number>();
  const chunks: Omit<Chunk, 'vector'>[] = [];
  for (const s of parsed.sections) {
    const text = toPlainText(s.content);
    if (text.length < MIN_TEXT_CHARS) continue;
    const part = parts.get(s.slug) ?? 0;
    parts.set(s.slug, part + 1);
    chunks.push({
      id: chunkId(page.url, s.slug, part),
      url: page.url,
      title: parsed.title,
      heading: s.level === 1 ? '' : s.heading,
      anchor: s.level === 1 ? '' : s.slug,
      text,
    });
  }
  return { title: parsed.title, checksum: parsed.checksum, chunks };
}

export function shouldPrune(opts: { match?: string; limit?: string }): boolean {
  return !opts.match && !opts.limit;
}

export async function ingest(
  pages: RawPage[],
  index: DocIndex,
  embed: Embedder,
  opts: { force?: boolean; prune?: boolean; keep?: string[]; log?: (s: string) => void } = {},
): Promise<IngestStats> {
  const log = opts.log ?? (() => {});
  const stats: IngestStats = { pages: pages.length, embedded: 0, skipped: 0, removed: 0, chunks: 0 };
  for (const page of pages) {
    const { title, checksum, chunks } = pageChunks(page);
    if (!opts.force && index.pages.get(page.url)?.checksum === checksum) {
      stats.skipped++;
      continue;
    }
    const vectors = chunks.length
      ? await embed(chunks.map((c) => `${c.title}\n${c.heading}\n${c.text}`))
      : [];
    index.setPage(
      page.url,
      { checksum, title },
      chunks.map((c, i) => ({ ...c, vector: vectors[i]! })),
    );
    stats.embedded++;
    log(`${page.url}  ${chunks.length} sections`);
  }
  if (opts.prune) {
    const keep = new Set([...pages.map((p) => p.url), ...(opts.keep ?? [])]);
    for (const url of [...index.pages.keys()]) {
      if (!keep.has(url)) {
        index.removePage(url);
        stats.removed++;
        log(`${url}  removed`);
      }
    }
  }
  stats.chunks = index.chunks.length;
  return stats;
}
