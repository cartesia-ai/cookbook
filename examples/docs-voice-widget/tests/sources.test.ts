import { describe, expect, it } from 'vitest';
import { sitemapPages } from '../ingest/sources';

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
    const pages = await sitemapPages(SITEMAP, { fetchImpl: f });
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
    const pages = await sitemapPages(SITEMAP, { fetchImpl: f });
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
    const pages = await sitemapPages(SITEMAP, { fetchImpl: f });
    expect(pages.map((p) => p.url)).toEqual(['https://docs.example.com/a']);
  });
});
