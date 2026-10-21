import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, openAIEmbedder, type Embedder } from '../server/embeddings';
import { loadEnvFiles } from '../server/env-file';
import { KEYWORD_MODEL } from '../server/keyword';
import { DocIndex } from '../server/store';
import { ingest, shouldPrune } from './run';
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

const apiKey = process.env.OPENAI_API_KEY;
const model = apiKey ? EMBEDDING_MODEL : KEYWORD_MODEL;
const dimensions = apiKey ? EMBEDDING_DIMENSIONS : 0;
const embed: Embedder = apiKey ? openAIEmbedder(apiKey) : async (texts) => texts.map(() => new Float32Array(0));
console.log(apiKey ? `Embedding with ${EMBEDDING_MODEL}.` : 'OPENAI_API_KEY is empty, so search will use keyword scoring.');

const out = resolve(values.out!);
const existing = DocIndex.load(out);
const index =
  existing && existing.model === model && existing.dimensions === dimensions ? existing : new DocIndex(model, dimensions);

const started = Date.now();
const { pages, failed } = values.sitemap
  ? await sitemapPages(values.sitemap, { match: values.match, limit: values.limit ? Number(values.limit) : undefined, log: console.log })
  : { pages: await folderPages(resolve(positionals[0] ?? 'content'), values['base-url']!), failed: [] };
if (failed.length) console.log(`${failed.length} pages failed to fetch; their old sections stay in the index.`);

const prune = shouldPrune(values);
if (!prune) console.log('--match or --limit is set, so pages outside this run stay in the index.');
const stats = await ingest(pages, index, embed, {
  force: values.force,
  prune,
  keep: failed,
  log: console.log,
});
index.save(out);
console.log(
  `${stats.pages} pages: ${stats.embedded} indexed, ${stats.skipped} unchanged, ${stats.removed} removed. ` +
    `${stats.chunks} sections in ${values.out} (${Date.now() - started} ms).`,
);
