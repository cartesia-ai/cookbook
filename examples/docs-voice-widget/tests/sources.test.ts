import { describe, expect, it } from 'vitest';
import { ingest } from '../ingest/run';
import { sitemapPages } from '../ingest/sources';
import { DocIndex } from '../server/store';

const SITEMAP = 'https://docs.example.com/sitemap.xml';
const xml = (...urls: string[]) => `<urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join('')}</urlset>`;

function fakeFetch(routes: Record<string, Response | (() => Response)>) {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const r = routes[url];
    if (!r) return new Response('missing', { status: 404 });
    return typeof r === 'function' ? r() : r.clone();
  }) as typeof fetch;
  return { f, calls };
}

const md = (text: string) => new Response(text, { headers: { 'content-type': 'text/markdown' } });

describe('sitemapPages', () => {
  it('fetches only pages on the sitemap host', async () => {
    const { f, calls } = fakeFetch({
      [SITEMAP]: new Response(xml('https://docs.example.com/a', 'https://evil.dev/b', 'http://169.254.169.254/latest', 'file:///etc/passwd')),
      'https://docs.example.com/a.md': md('# A\n\nPage a text that is long enough to keep.'),
    });
    const { pages } = await sitemapPages(SITEMAP, { fetchImpl: f });
    expect(pages.map((p) => p.url)).toEqual(['https://docs.example.com/a']);
    expect(calls.every((u) => u.startsWith('https://docs.example.com/'))).toBe(true);
  });

  it('follows redirects on the same host and refuses ones that leave it', async () => {
    const redirect = (to: string) => () => new Response(null, { status: 302, headers: { location: to } });
    const { f, calls } = fakeFetch({
      [SITEMAP]: new Response(xml('https://docs.example.com/moved', 'https://docs.example.com/leaks')),
      'https://docs.example.com/moved.md': redirect('/new.md'),
      'https://docs.example.com/new.md': md('# New\n\nMoved page text that is long enough.'),
      'https://docs.example.com/leaks.md': redirect('http://169.254.169.254/'),
      'https://docs.example.com/leaks': redirect('https://evil.dev/'),
    });
    const { pages } = await sitemapPages(SITEMAP, { fetchImpl: f });
    expect(pages.map((p) => p.url)).toEqual(['https://docs.example.com/moved']);
    expect(calls).not.toContain('http://169.254.169.254/');
    expect(calls).not.toContain('https://evil.dev/');
  });

  it('refuses a sitemap that redirects to another host', async () => {
    const { f, calls } = fakeFetch({
      [SITEMAP]: () => new Response(null, { status: 301, headers: { location: 'http://169.254.169.254/sitemap.xml' } }),
    });
    await expect(sitemapPages(SITEMAP, { fetchImpl: f })).rejects.toThrow('redirect off docs.example.com');
    expect(calls).toEqual([SITEMAP]);
  });

  it('follows a sitemap redirect on the same host', async () => {
    const { f } = fakeFetch({
      [SITEMAP]: () => new Response(null, { status: 301, headers: { location: '/sitemap-0.xml' } }),
      'https://docs.example.com/sitemap-0.xml': new Response(xml('https://docs.example.com/a')),
      'https://docs.example.com/a.md': md('# A\n\nPage a text that is long enough to keep.'),
    });
    const { pages } = await sitemapPages(SITEMAP, { fetchImpl: f });
    expect(pages.map((p) => p.url)).toEqual(['https://docs.example.com/a']);
  });

  it('reports pages that failed to fetch', async () => {
    const { f } = fakeFetch({
      [SITEMAP]: new Response(xml('https://docs.example.com/a', 'https://docs.example.com/down')),
      'https://docs.example.com/a.md': md('# A\n\nPage a text that is long enough to keep.'),
      'https://docs.example.com/down': () => new Response('oops', { status: 502 }),
    });
    const { pages, failed } = await sitemapPages(SITEMAP, { fetchImpl: f });
    expect(pages.map((p) => p.url)).toEqual(['https://docs.example.com/a']);
    expect(failed).toEqual(['https://docs.example.com/down']);
  });
});

describe('ingest prune', () => {
  const embed = async (texts: string[]) => texts.map(() => new Float32Array(0));
  const page = (url: string, words: string) => ({ url, markdown: `# ${url}\n\n${words} text that is long enough to keep in the index.` });

  it('keeps pages that failed to fetch and removes pages that left the sitemap', async () => {
    const index = new DocIndex('m', 0);
    await ingest([page('/a', 'alpha'), page('/flaky', 'beta'), page('/gone', 'gamma')], index, embed);
    const stats = await ingest([page('/a', 'alpha')], index, embed, { prune: true, keep: ['/flaky'] });
    expect([...index.pages.keys()].sort()).toEqual(['/a', '/flaky']);
    expect(stats.removed).toBe(1);
  });
});
