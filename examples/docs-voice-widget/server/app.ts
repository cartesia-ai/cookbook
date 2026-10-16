import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import type { Embedder } from './embeddings';
import { RateLimiter, originAllowed } from './guard';
import { searchDocs } from './search';
import type { DocIndex } from './store';

export interface AppConfig {
  agentId: string | undefined;
  allowedOrigins: string[];
  publicOrigin?: string;
  maxSessionSecs: number;
  title: string;
}

export interface AppDeps {
  config: AppConfig;
  mintToken: () => Promise<{ token: string; expiresIn: number }>;
  embed: Embedder;
  getIndex: () => DocIndex | null;
  clientIp: (c: Context) => string;
  widgetJs: () => Promise<string>;
  fontFile?: () => Promise<Uint8Array>;
  extend?: (app: Hono) => void;
  tokenLimiter?: RateLimiter;
  searchLimiter?: RateLimiter;
  hasKeys?: { cartesia: boolean; openai: boolean };
}

const NO_STORE = { 'Cache-Control': 'no-store' };

export function createApp(deps: AppDeps): Hono {
  const { config } = deps;
  const app = new Hono();
  const tokenLimiter = deps.tokenLimiter ?? new RateLimiter([{ limit: 4, windowMs: 60_000 }, { limit: 30, windowMs: 3_600_000 }]);
  const searchLimiter = deps.searchLimiter ?? new RateLimiter([{ limit: 30, windowMs: 60_000 }]);

  const selfOrigin = (c: Context) => config.publicOrigin ?? new URL(c.req.url).origin;
  const allowed = (c: Context) => originAllowed(c.req.header('origin'), config.allowedOrigins, selfOrigin(c));

  app.use(
    '/api/*',
    cors({
      origin: (origin, c) => (originAllowed(origin, config.allowedOrigins, selfOrigin(c)) ? origin : null),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      maxAge: 600,
    }),
  );

  app.get('/api/config', (c) =>
    c.json(
      { ready: Boolean(config.agentId), agentId: config.agentId ?? null, title: config.title, maxSessionSecs: config.maxSessionSecs },
      200,
      NO_STORE,
    ),
  );

  app.post('/api/token', async (c) => {
    if (!allowed(c)) return c.json({ error: 'This site is not allowed to start voice sessions.' }, 403, NO_STORE);
    if (!config.agentId) return c.json({ error: 'The voice agent is not set up yet.' }, 503, NO_STORE);
    const retry = tokenLimiter.take(deps.clientIp(c));
    if (retry) return c.json({ error: 'Too many sessions. Try again in a minute.' }, 429, { ...NO_STORE, 'Retry-After': String(retry) });
    try {
      const { token, expiresIn } = await deps.mintToken();
      return c.json({ token, expiresIn, agentId: config.agentId }, 200, NO_STORE);
    } catch {
      return c.json({ error: 'Could not start a voice session.' }, 502, NO_STORE);
    }
  });

  app.post('/api/search', async (c) => {
    if (!allowed(c)) return c.json({ error: 'This site is not allowed to search.' }, 403, NO_STORE);
    const retry = searchLimiter.take(deps.clientIp(c));
    if (retry) return c.json({ error: 'Too many searches. Slow down.' }, 429, { ...NO_STORE, 'Retry-After': String(retry) });
    let body: { query?: unknown; page?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Send JSON with a query.' }, 400, NO_STORE);
    }
    if (typeof body.query !== 'string' || !body.query.trim()) return c.json({ error: 'Send JSON with a query.' }, 400, NO_STORE);
    const index = deps.getIndex();
    if (!index) return c.json({ error: 'The docs are not indexed yet. Run pnpm ingest.' }, 503, NO_STORE);
    try {
      const page = typeof body.page === 'string' ? body.page.slice(0, 500) : undefined;
      return c.json(await searchDocs(index, deps.embed, body.query, page), 200, NO_STORE);
    } catch {
      return c.json({ error: 'Search failed.' }, 502, NO_STORE);
    }
  });

  app.get('/widget.js', async (c) => {
    try {
      const js = await deps.widgetJs();
      return c.body(js, 200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      });
    } catch (err) {
      console.error('widget build failed:', err instanceof Error ? err.message : err);
      return c.text('// The widget failed to build. See the server log.', 500);
    }
  });

  if (deps.fontFile) {
    const font = deps.fontFile;
    app.get('/widget/inter.woff2', async (c) =>
      c.body((await font()) as Uint8Array<ArrayBuffer>, 200, {
        'Content-Type': 'font/woff2',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      }),
    );
  }

  app.get('/health', (c) =>
    c.json({
      cartesiaKey: deps.hasKeys?.cartesia ?? false,
      openaiKey: deps.hasKeys?.openai ?? false,
      agent: Boolean(config.agentId),
      sections: deps.getIndex()?.chunks.length ?? 0,
    }),
  );

  deps.extend?.(app);
  return app;
}
