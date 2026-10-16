import { readFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import Cartesia from '@cartesia/cartesia-js';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { createApp } from './app';
import { mountDemo } from './demo';
import { openAIEmbedder } from './embeddings';
import { loadEnvFiles } from './env-file';
import { lastForwardedFor, parseOrigins } from './guard';
import { KEYWORD_MODEL } from './keyword';
import { DocIndex } from './store';
import { widgetSource } from './widget-bundle';

const root = resolve(import.meta.dirname, '..');
loadEnvFiles(root);
const env = process.env;
const production = env.NODE_ENV === 'production';
const port = Number(env.PORT || 4512);
const indexPath = resolve(root, env.INDEX_PATH || 'data/index.json');

let index: DocIndex | null = null;
let indexMtime = 0;
function getIndex(): DocIndex | null {
  try {
    const m = statSync(indexPath).mtimeMs;
    if (m !== indexMtime) {
      index = DocIndex.load(indexPath);
      indexMtime = m;
    }
  } catch {
    index = null;
    indexMtime = 0;
  }
  return index;
}

const require = createRequire(import.meta.url);
const fontPath = require.resolve('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2');
let font: Promise<Uint8Array> | null = null;

const app = createApp({
  config: {
    agentId: env.CARTESIA_AGENT_ID || undefined,
    allowedOrigins: parseOrigins(env.ALLOWED_ORIGINS),
    publicOrigin: env.PUBLIC_URL ? new URL(env.PUBLIC_URL).origin : undefined,
    maxSessionSecs: Number(env.MAX_SESSION_SECS || 300),
    title: env.WIDGET_TITLE || 'Ask the docs',
  },
  async mintToken() {
    const apiKey = env.CARTESIA_API_KEY;
    if (!apiKey) throw new Error('CARTESIA_API_KEY is not set.');
    const client = new Cartesia({ apiKey });
    const { token } = await client.accessToken.create({ grants: { agent: true }, expires_in: 60 });
    return { token, expiresIn: 60 };
  },
  embed: openAIEmbedder(env.OPENAI_API_KEY),
  getIndex,
  clientIp: (c) =>
    (env.TRUST_PROXY === '1' ? lastForwardedFor(c.req.header('x-forwarded-for')) : undefined) ||
    getConnInfo(c).remote.address ||
    'unknown',
  widgetJs: widgetSource(production),
  fontFile: () => (font ??= readFile(fontPath)),
  extend: env.DEMO_SITE === '0' ? undefined : (a) => mountDemo(a, join(root, 'content')),
});

serve({ fetch: app.fetch, port }, (info) => {
  const missing = [
    !env.CARTESIA_API_KEY && 'CARTESIA_API_KEY',
    !env.CARTESIA_AGENT_ID && 'CARTESIA_AGENT_ID (run npm run setup:agent)',
  ].filter(Boolean);
  console.log(`docs-voice-widget on http://localhost:${info.port}`);
  if (missing.length) console.log(`Missing: ${missing.join(', ')}`);
  const idx = getIndex();
  if (!idx) console.log('No index yet. Run npm run ingest.');
  else if (idx.model === KEYWORD_MODEL) console.log('Search: keyword. Set OPENAI_API_KEY and run npm run ingest again for embeddings.');
  else if (!env.OPENAI_API_KEY) console.log('The index uses OpenAI embeddings but OPENAI_API_KEY is empty. Set it, or run npm run ingest again for keyword search.');
  else console.log('Search: OpenAI embeddings.');
});
