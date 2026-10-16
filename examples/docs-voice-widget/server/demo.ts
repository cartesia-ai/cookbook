import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import GithubSlugger from 'github-slugger';
import type { Hono } from 'hono';
import { Marked, type Tokens } from 'marked';
import { headingText, parseFrontmatter } from '../ingest/chunk';
import { DARK, FONT_STACK, LIGHT, MONO_STACK, cssVars } from '../widget/src/tokens';

export interface DemoPage {
  slug: string;
  title: string;
  source: string;
  fetched: string;
  html: string;
}

const ORDER = ['websocket-api', 'client-tools', 'webhook-tools', 'tools', 'authenticate'];

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

export function renderMarkdown(md: string): string {
  const slugger = new GithubSlugger();
  const marked = new Marked({
    renderer: {
      heading(this: { parser: { parseInline(t: Tokens.Heading['tokens']): string } }, token: Tokens.Heading) {
        const id = slugger.slug(headingText(token.text));
        return `<h${token.depth} id="${id}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
      },
      link(this: { parser: { parseInline(t: Tokens.Link['tokens']): string } }, token: Tokens.Link) {
        const href = token.href.startsWith('/') ? `https://docs.cartesia.ai${token.href}` : token.href;
        return `<a href="${escapeHtml(href)}">${this.parser.parseInline(token.tokens)}</a>`;
      },
      html(token: Tokens.HTML | Tokens.Tag) {
        return escapeHtml(token.text);
      },
    },
  });
  return marked.parse(md, { async: false });
}

export function loadDemoPages(dir: string): DemoPage[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  const rank = (f: string) => {
    const i = ORDER.indexOf(f.replace(/\.md$/, ''));
    return i === -1 ? ORDER.length : i;
  };
  files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return files.map((file) => {
    const { data, body } = parseFrontmatter(readFileSync(join(dir, file), 'utf8'));
    return {
      slug: file.replace(/\.md$/, ''),
      title: data.title || file,
      source: data.source || '',
      fetched: data.fetched || '',
      html: renderMarkdown(body),
    };
  });
}

const SUN = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-14.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
const MOON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;

const CSS = `
@font-face { font-family: "Inter Variable"; font-style: normal; font-display: swap; font-weight: 100 900; src: url(/widget/inter.woff2) format("woff2-variations"); }
:root { ${cssVars(LIGHT)} color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not(.light) { ${cssVars(DARK)} color-scheme: dark; } }
:root.dark { ${cssVars(DARK)} color-scheme: dark; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-padding-top: 80px; }
body { margin: 0; background: var(--background); color: var(--foreground); font: 14px/1.6 ${FONT_STACK}; }
a { color: var(--primary); text-underline-offset: 3px; }
.bar { position: sticky; top: 0; z-index: 10; height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; border-bottom: 1px solid var(--border); background: color-mix(in oklab, var(--background) 92%, transparent); backdrop-filter: blur(8px); }
.bar .name { font-size: 14px; font-weight: 600; color: var(--foreground); text-decoration: none; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: 0; border-radius: 8px; background: transparent; color: var(--foreground); cursor: pointer; }
.icon-btn:hover { background: var(--accent); color: var(--accent-foreground); }
.icon-btn:focus-visible { outline: 3px solid color-mix(in oklab, var(--ring) 50%, transparent); }
.icon-btn .moon, :root.dark .icon-btn .sun { display: none; }
:root.dark .icon-btn .moon { display: inline; }
@media (prefers-color-scheme: dark) { :root:not(.light) .icon-btn .sun { display: none; } :root:not(.light) .icon-btn .moon { display: inline; } }
.layout { max-width: 1120px; margin: 0 auto; padding: 0 16px; display: grid; grid-template-columns: 1fr; }
.side { padding: 12px 0; border-bottom: 1px solid var(--border); overflow-x: auto; }
.side p { display: none; }
.side ul { list-style: none; margin: 0; padding: 0; display: flex; gap: 4px; }
.side a { display: block; white-space: nowrap; padding: 6px 10px; border-radius: 8px; color: var(--muted-foreground); text-decoration: none; font-size: 14px; }
.side a:hover { color: var(--foreground); background: var(--muted); }
.side a[aria-current="page"] { background: var(--accent); color: var(--accent-foreground); font-weight: 500; }
article { min-width: 0; padding: 32px 0 160px; max-width: 720px; }
.note { margin: 0 0 24px; font-size: 13px; color: var(--muted-foreground); }
article h1 { font-size: 24px; line-height: 1.25; font-weight: 600; margin: 0 0 8px; letter-spacing: -0.01em; }
article h1 + blockquote { margin: 0 0 32px; padding: 0; border: 0; font-size: 14px; color: var(--muted-foreground); }
article h1 + blockquote p { margin: 0; }
article h2 { font-size: 18px; line-height: 1.35; font-weight: 600; margin: 40px 0 12px; }
article h3 { font-size: 15px; line-height: 1.4; font-weight: 600; margin: 28px 0 8px; }
article p, article ul, article ol { margin: 0 0 16px; }
article li { margin: 4px 0; }
article code { font: 12.5px/1.5 ${MONO_STACK}; background: var(--muted); border: 1px solid var(--border); border-radius: 6px; padding: 1px 5px; }
article pre { margin: 0 0 16px; padding: 14px 16px; overflow-x: auto; background: var(--card); border: 1px solid var(--border); border-radius: 14px; }
article pre code { background: none; border: 0; padding: 0; font-size: 12.5px; }
article table { width: 100%; border-collapse: collapse; margin: 0 0 16px; font-size: 13px; display: block; overflow-x: auto; }
article th, article td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
article th { font-weight: 500; color: var(--muted-foreground); }
article blockquote { margin: 0 0 16px; padding: 0 0 0 14px; border-left: 2px solid var(--border); color: var(--muted-foreground); }
@media (min-width: 640px) { .bar { padding: 0 24px; } .layout { padding: 0 24px; } }
@media (min-width: 900px) {
  .layout { grid-template-columns: 220px minmax(0, 1fr); gap: 48px; }
  .side { position: sticky; top: 56px; align-self: start; height: calc(100vh - 56px); padding: 32px 0; border-bottom: 0; overflow: auto; }
  .side p { display: block; margin: 0 0 8px; padding: 0 10px; font-size: 12px; font-weight: 500; color: var(--muted-foreground); }
  .side ul { flex-direction: column; gap: 2px; }
  article { padding-top: 40px; }
  article h1 { font-size: 28px; }
}
`;

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('demo-theme');if(t==='dark'||t==='light')document.documentElement.classList.add(t);}catch(e){}})();`;
const TOGGLE_SCRIPT = `document.getElementById('theme').addEventListener('click',function(){var r=document.documentElement;var dark=r.classList.contains('dark')||(!r.classList.contains('light')&&matchMedia('(prefers-color-scheme: dark)').matches);r.classList.remove('dark','light');r.classList.add(dark?'light':'dark');try{localStorage.setItem('demo-theme',dark?'light':'dark');}catch(e){}});`;

export function renderDemoPage(pages: DemoPage[], page: DemoPage): string {
  const nav = pages
    .map((p) => `<li><a href="/docs/${p.slug}"${p.slug === page.slug ? ' aria-current="page"' : ''}>${escapeHtml(p.title)}</a></li>`)
    .join('');
  const source = page.source
    ? `Demo copy of <a href="${escapeHtml(page.source)}">${escapeHtml(page.source.replace(/^https:\/\//, ''))}</a>${page.fetched ? `, fetched ${escapeHtml(page.fetched)}` : ''}.`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>${escapeHtml(page.title)} | Cartesia docs demo</title>
<meta name="description" content="A demo docs site with a talk-to-the-docs voice widget built on Cartesia Managed Agents.">
<script>${THEME_SCRIPT}</script>
<style>${CSS}</style>
</head>
<body>
<header class="bar"><a class="name" href="/">Cartesia docs demo</a><button class="icon-btn" id="theme" type="button" aria-label="Toggle theme"><span class="sun">${SUN}</span><span class="moon">${MOON}</span></button></header>
<div class="layout">
<nav class="side" aria-label="Pages"><p>Agents</p><ul>${nav}</ul></nav>
<article>
<p class="note">${source}</p>
${page.html}
</article>
</div>
<script>${TOGGLE_SCRIPT}</script>
<!-- The whole integration: one script tag. -->
<script src="/widget.js" defer></script>
</body>
</html>`;
}

export function mountDemo(app: Hono, contentDir: string): void {
  const pages = loadDemoPages(contentDir);
  app.get('/', (c) => c.redirect(`/docs/${pages[0]?.slug ?? ''}`));
  app.get('/docs/:slug', (c) => {
    const page = pages.find((p) => p.slug === c.req.param('slug'));
    if (!page) return c.text('Not found', 404);
    return c.html(renderDemoPage(pages, page));
  });
}
