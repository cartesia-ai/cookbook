import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { parse, type HTMLElement } from 'node-html-parser';

export interface RawPage {
  url: string;
  markdown: string;
  anchors?: string[];
}

export async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  const nested = await Promise.all(
    entries.map(async (name) => {
      const path = join(dir, name);
      const s = await stat(path);
      if (s.isDirectory()) return name.startsWith('.') || name === 'node_modules' ? [] : walk(path);
      return /\.mdx?$/.test(name) ? [path] : [];
    }),
  );
  return nested.flat().sort();
}

export function urlForFile(root: string, file: string, baseUrl: string): string {
  const rel = relative(root, file).split(sep).join('/').replace(/\.mdx?$/, '').replace(/(^|\/)index$/, '');
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return (base + rel).replace(/\/$/, '') || '/';
}

export async function folderPages(root: string, baseUrl: string): Promise<RawPage[]> {
  const files = await walk(root);
  return Promise.all(
    files.map(async (file) => {
      const markdown = await readFile(file, 'utf8');
      const url = markdown.match(/^---[\s\S]*?^url:\s*(\S+)[\s\S]*?^---/m)?.[1] ?? urlForFile(root, file, baseUrl);
      return { url, markdown };
    }),
  );
}

export function sitemapUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!.replace(/&amp;/g, '&'));
}

const SKIP = 'script,style,noscript,nav,header,footer,aside,svg,form,button,[aria-hidden="true"]';

export function htmlToMarkdown(html: string): { markdown: string; anchors: string[] } {
  const doc = parse(html);
  const root = doc.querySelector('main article') ?? doc.querySelector('article') ?? doc.querySelector('main') ?? doc.querySelector('body') ?? doc;
  for (const el of root.querySelectorAll(SKIP)) el.remove();
  const lines: string[] = [];
  const anchors: string[] = [];
  const visit = (el: HTMLElement) => {
    const tag = el.tagName?.toLowerCase();
    const h = tag?.match(/^h([1-6])$/);
    if (h) {
      const text = el.textContent.replace(/\s+/g, ' ').replace(/#$/, '').trim();
      if (text) {
        anchors.push(el.id || el.querySelector('[id]')?.id || '');
        lines.push(`${'#'.repeat(Number(h[1]))} ${text}`, '');
      }
      return;
    }
    if (tag === 'pre') {
      lines.push('```', el.textContent.trim(), '```', '');
      return;
    }
    if (tag === 'p' || tag === 'li' || tag === 'td' || tag === 'th' || tag === 'dt' || tag === 'dd' || tag === 'blockquote') {
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      if (text) lines.push(tag === 'li' ? `- ${text}` : text, '');
      return;
    }
    for (const child of el.childNodes) if ((child as HTMLElement).tagName) visit(child as HTMLElement);
  };
  visit(root as HTMLElement);
  return { markdown: lines.join('\n'), anchors };
}

const MAX_REDIRECTS = 5;

export function onHost(url: string, host: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.host === host;
  } catch {
    return false;
  }
}

export async function fetchOnHost(f: typeof fetch, url: string, host: string): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!onHost(current, host)) throw new Error(`redirect off ${host}`);
    const res = await f(current, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) return res;
    current = new URL(location, current).toString();
  }
  throw new Error('too many redirects');
}

export async function sitemapPages(
  sitemap: string,
  opts: { match?: string; limit?: number; fetchImpl?: typeof fetch; log?: (s: string) => void } = {},
): Promise<{ pages: RawPage[]; failed: string[] }> {
  const f = opts.fetchImpl ?? fetch;
  const host = new URL(sitemap).host;
  const res = await fetchOnHost(f, sitemap, host);
  if (!res.ok) throw new Error(`The sitemap answered ${res.status}.`);
  let urls = sitemapUrls(await res.text());
  const offHost = urls.filter((u) => !onHost(u, host));
  if (offHost.length) opts.log?.(`skip ${offHost.length} URLs that are not on ${host}`);
  urls = urls.filter((u) => onHost(u, host));
  if (opts.match) urls = urls.filter((u) => u.includes(opts.match!));
  if (opts.limit) urls = urls.slice(0, opts.limit);
  const pages: RawPage[] = [];
  const failed: string[] = [];
  for (const url of urls) {
    try {
      const md = await fetchOnHost(f, `${url.replace(/\/$/, '')}.md`, host).catch(() => null);
      const type = md?.headers.get('content-type') ?? '';
      if (md?.ok && !type.includes('html')) {
        pages.push({ url, markdown: await md.text() });
        continue;
      }
      const page = await fetchOnHost(f, url, host);
      if (!page.ok) {
        const transient = page.status >= 500 || page.status === 429;
        opts.log?.(`skip ${url} (${page.status})`);
        if (transient) failed.push(url);
        continue;
      }
      const { markdown, anchors } = htmlToMarkdown(await page.text());
      pages.push({ url, markdown, anchors });
    } catch (err) {
      opts.log?.(`skip ${url} (${err instanceof Error ? err.message : 'error'})`);
      failed.push(url);
    }
  }
  return { pages, failed };
}
