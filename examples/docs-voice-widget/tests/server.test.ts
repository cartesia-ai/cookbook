import { describe, expect, it, vi } from 'vitest';
import { createApp, type AppDeps } from '../server/app';
import { RateLimiter, originAllowed, parseOrigins } from '../server/guard';
import { DocIndex } from '../server/store';

const SELF = 'http://localhost:4512';

function app(over: Partial<AppDeps> = {}) {
  const deps: AppDeps = {
    config: { agentId: 'agent_x', allowedOrigins: ['https://docs.example.com'], maxSessionSecs: 300, title: 'Ask the docs' },
    mintToken: vi.fn(async () => ({ token: 'tok', expiresIn: 60 })),
    embed: async () => [new Float32Array([1])],
    getIndex: () => new DocIndex('m', 1),
    clientIp: () => '1.2.3.4',
    widgetJs: async () => '/* js */',
    ...over,
  };
  return { app: createApp(deps), deps };
}

const post = (path: string, origin?: string, body?: unknown) =>
  new Request(`${SELF}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('origin allowlist', () => {
  it('allows the server itself and listed origins only', () => {
    const list = parseOrigins(' https://Docs.Example.com/ , https://b.dev');
    expect(list).toEqual(['https://docs.example.com', 'https://b.dev']);
    expect(originAllowed(SELF, list, SELF)).toBe(true);
    expect(originAllowed('https://docs.example.com', list, SELF)).toBe(true);
    expect(originAllowed('https://evil.dev', list, SELF)).toBe(false);
    expect(originAllowed(undefined, list, SELF)).toBe(false);
  });
});

describe('RateLimiter', () => {
  it('blocks past the limit and resets after the window', () => {
    let now = 0;
    const rl = new RateLimiter([{ limit: 2, windowMs: 1000 }], () => now);
    expect([rl.take('a'), rl.take('a'), rl.take('b')]).toEqual([0, 0, 0]);
    expect(rl.take('a')).toBe(1);
    now = 1000;
    expect(rl.take('a')).toBe(0);
  });
});

describe('POST /api/token', () => {
  it('mints a token for an allowed origin and never caches it', async () => {
    const { app: a } = app();
    const res = await a.fetch(post('/api/token', 'https://docs.example.com'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('access-control-allow-origin')).toBe('https://docs.example.com');
    expect(await res.json()).toEqual({ token: 'tok', expiresIn: 60, agentId: 'agent_x' });
  });

  it('rejects other origins and requests with no Origin without minting', async () => {
    const { app: a, deps } = app();
    expect((await a.fetch(post('/api/token', 'https://evil.dev'))).status).toBe(403);
    expect((await a.fetch(post('/api/token'))).status).toBe(403);
    expect(deps.mintToken).not.toHaveBeenCalled();
  });

  it('rate limits per IP', async () => {
    const { app: a } = app({ tokenLimiter: new RateLimiter([{ limit: 1, windowMs: 60_000 }]) });
    expect((await a.fetch(post('/api/token', SELF))).status).toBe(200);
    const res = await a.fetch(post('/api/token', SELF));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('hides upstream errors', async () => {
    const { app: a } = app({ mintToken: async () => { throw new Error('sk_car_secret leaked'); } });
    const res = await a.fetch(post('/api/token', SELF));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('sk_car');
  });

  it('answers 503 when no agent is configured', async () => {
    const { app: a } = app({ config: { agentId: undefined, allowedOrigins: [], maxSessionSecs: 300, title: 't' } });
    expect((await a.fetch(post('/api/token', SELF))).status).toBe(503);
  });
});

describe('POST /api/search', () => {
  it('validates input and needs an index', async () => {
    const { app: a } = app();
    expect((await a.fetch(post('/api/search', SELF, { query: '' }))).status).toBe(400);
    expect((await a.fetch(post('/api/search', SELF, { query: 'hi' }))).status).toBe(200);
    const { app: none } = app({ getIndex: () => null });
    expect((await none.fetch(post('/api/search', SELF, { query: 'hi' }))).status).toBe(503);
    expect((await a.fetch(post('/api/search', 'https://evil.dev', { query: 'hi' }))).status).toBe(403);
  });
});
