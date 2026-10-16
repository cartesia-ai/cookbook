import { createHash } from 'node:crypto';
import GithubSlugger from 'github-slugger';

export interface Section {
  heading: string;
  slug: string;
  level: number;
  content: string;
}

export interface ParsedPage {
  title: string;
  checksum: string;
  frontmatter: Record<string, string>;
  sections: Section[];
}

export const MAX_SECTION_CHARS = 1600;

export function checksum(text: string): string {
  return createHash('sha256').update(text).digest('base64');
}

export function parseFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: text };
  const data: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) data[kv[1]!] = kv[2]!.replace(/^(['"])(.*)\1$/, '$2').trim();
  }
  return { data, body: text.slice(m[0].length) };
}

export function cleanMarkdown(md: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  let indent = 0;
  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw;
    const f = line.match(/^(\s*)(```+|~~~+)(.*)$/);
    if (f) {
      if (fence === null) {
        fence = f[2]!;
        indent = f[1]!.length;
        const info = f[3]!.replace(/\s+theme=\{[^}]*\}/g, '').replace(/\s+(lines|wrap|expandable)\b/g, '');
        out.push(line.replace(/^(\s*)(```+|~~~+).*$/, `$1$2${info.trimEnd()}`).trimStart());
        continue;
      }
      if (f[2]!.startsWith(fence) && f[3]!.trim() === '') {
        fence = null;
        out.push(f[2]!);
        continue;
      }
    }
    if (fence !== null) {
      out.push(line.slice(Math.min(indent, line.length - line.trimStart().length)));
      continue;
    }
    if (/^>\s*(## Documentation Index|Fetch the complete documentation index|Use this file to discover)/.test(line)) continue;
    if (/^This documentation is built and hosted on/.test(line)) continue;
    if (/^\s*<\/?[A-Za-z][\w.]*(\s[^>]*)?\/?>\s*$/.test(line)) continue;
    if (/^\s*<img\s/.test(line)) continue;
    const noImages = line.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<\/?[A-Z][\w.]*[^>]*>/g, '');
    out.push(/^\s*([-*+]|\d+\.)\s/.test(noImages) ? noImages : noImages.trimStart());
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function headingText(raw: string): string {
  return raw.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '').trim();
}

export function toPlainText(md: string): string {
  return md
    .replace(/^```[^\n]*\n/gm, '')
    .replace(/^```$/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*`]+/g, '')
    // _emphasis_ only; snake_case names keep their underscores.
    .replace(/(^|[^\w])_([^_\n]+)_(?![\w])/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\|/g, ' ')
    .replace(/^\s*-{3,}\s*$/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let cur = '';
  for (const para of text.split(/\n{2,}/)) {
    if (cur && cur.length + para.length + 2 > max) {
      parts.push(cur);
      cur = '';
    }
    cur = cur ? `${cur}\n\n${para}` : para;
    while (cur.length > max * 1.5) {
      parts.push(cur.slice(0, max));
      cur = cur.slice(max);
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

export function splitSections(md: string, opts: { anchors?: string[]; maxChars?: number } = {}): Section[] {
  const slugger = new GithubSlugger();
  const sections: Section[] = [];
  let cur: Section = { heading: '', slug: '', level: 0, content: '' };
  let fence = false;
  let n = 0;
  const lines: string[] = [];
  const flush = () => {
    cur.content = lines.join('\n').trim();
    if (cur.content || cur.heading) sections.push(cur);
    lines.length = 0;
  };
  for (const line of md.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = !fence && line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) {
      flush();
      const heading = headingText(h[2]!);
      const generated = slugger.slug(heading);
      const slug = opts.anchors?.[n] || generated;
      n++;
      cur = { heading, slug, level: h[1]!.length, content: '' };
      continue;
    }
    lines.push(line);
  }
  flush();

  const max = opts.maxChars ?? MAX_SECTION_CHARS;
  return sections.flatMap((s) => splitLong(s.content, max).map((content) => ({ ...s, content })));
}

export function parsePage(text: string, opts: { anchors?: string[] } = {}): ParsedPage {
  const { data, body } = parseFrontmatter(text);
  const cleaned = cleanMarkdown(body);
  const sections = splitSections(cleaned, opts);
  const h1 = sections.find((s) => s.level === 1)?.heading;
  return {
    title: data.title || h1 || 'Untitled',
    checksum: checksum(text),
    frontmatter: data,
    sections,
  };
}
