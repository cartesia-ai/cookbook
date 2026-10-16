import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, openAIEmbedder } from '../server/embeddings';
import { loadEnvFiles } from '../server/env-file';
import { DocIndex } from '../server/store';
import { ingest } from './run';
import { folderPages, sitemapPages } from './sources';

loadEnvFiles(process.cwd());
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    sitemap: { type: 'string' },
    'base-url': { type: 'string', default: '/docs/' },
    match: { type: 'string' },
    limit: { type: 'string' },
    out: { type: 'string', default: process.env.INDEX_PATH || 'data/index.json' },
    force: { type: 'boolean', default: false },
  },
});

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is empty. Put it in .env.local (see .env.example) and run this again.');
  process.exit(1);
}

const out = resolve(values.out!);
const existing = DocIndex.load(out);
const index =
  existing && existing.model === EMBEDDING_MODEL && existing.dimensions === EMBEDDING_DIMENSIONS
    ? existing
    : new DocIndex(EMBEDDING_MODEL, EMBEDDING_DIMENSIONS);

const started = Date.now();
const pages = values.sitemap
  ? await sitemapPages(values.sitemap, { match: values.match, limit: values.limit ? Number(values.limit) : undefined, log: console.log })
  : await folderPages(resolve(positionals[0] ?? 'content'), values['base-url']!);

const stats = await ingest(pages, index, openAIEmbedder(process.env.OPENAI_API_KEY), {
  force: values.force,
  prune: true,
  log: console.log,
});
index.save(out);
console.log(
  `${stats.pages} pages: ${stats.embedded} embedded, ${stats.skipped} unchanged, ${stats.removed} removed. ` +
    `${stats.chunks} sections in ${values.out} (${Date.now() - started} ms).`,
);
