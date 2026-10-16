import { describe, expect, it } from 'vitest';
import { cleanMarkdown, parsePage, splitSections, toPlainText } from '../ingest/chunk';
import { pageChunks } from '../ingest/run';
import { htmlToMarkdown, urlForFile } from '../ingest/sources';

describe('cleanMarkdown', () => {
  it('drops the Mintlify banner, JSX tags, images and fence attributes', () => {
    const md = [
      '> ## Documentation Index',
      '> Fetch the complete documentation index at: https://docs.example.com/llms.txt',
      '',
      '# Title',
      '<Frame caption="x">',
      '  <img src="a.png" alt="" />',
      '</Frame>',
      '<CodeGroup>',
      '  ```bash cURL lines theme={null}',
      '  curl -X POST',
      '  ```',
      '</CodeGroup>',
      'Text ![pic](p.png) stays.',
      'This documentation is built and hosted on [Mintlify](https://mintlify.com).',
    ].join('\n');
    const out = cleanMarkdown(md);
    expect(out).not.toMatch(/Documentation Index|<Frame|<img|theme=|Mintlify/);
    expect(out).toContain('```bash cURL\ncurl -X POST\n```');
    expect(out).toContain('Text  stays.');
  });
});

describe('splitSections', () => {
  it('splits by heading with GitHub slugs and ignores # inside code fences', () => {
    const s = splitSections('# Top\nintro\n## Set up\na\n```sh\n# not a heading\n```\n## Set up\nb\n');
    expect(s.map((x) => [x.heading, x.slug, x.level])).toEqual([
      ['Top', 'top', 1],
      ['Set up', 'set-up', 2],
      ['Set up', 'set-up-1', 2],
    ]);
    expect(s[1]!.content).toContain('# not a heading');
  });

  it('uses heading ids from the HTML when given', () => {
    const s = splitSections('## One\nx\n## Two\ny', { anchors: ['custom-one', ''] });
    expect(s.map((x) => x.slug)).toEqual(['custom-one', 'two']);
  });

  it('splits long sections into parts that keep the anchor', () => {
    const para = 'word '.repeat(100).trim();
    const s = splitSections(`## Long\n${Array(8).fill(para).join('\n\n')}`, { maxChars: 1200 });
    expect(s.length).toBeGreaterThan(1);
    expect(new Set(s.map((x) => x.slug))).toEqual(new Set(['long']));
  });
});

describe('toPlainText', () => {
  it('keeps snake_case names and strips emphasis and links', () => {
    expect(toPlainText('Set `expects_response` to _true_ in [the docs](/x).')).toBe('Set expects_response to true in the docs.');
  });
});

describe('pageChunks', () => {
  it('gives each section a stable id, a URL and an anchor; the h1 intro anchors to the top', () => {
    const page = { url: '/docs/a', markdown: '---\ntitle: Page A\n---\n# Page A\nIntro text that is long enough to index.\n## Limits\nResults are strings up to 4096 bytes long.\n## Empty\n' };
    const { title, chunks } = pageChunks(page);
    expect(title).toBe('Page A');
    expect(chunks.map((c) => [c.anchor, c.heading])).toEqual([['', ''], ['limits', 'Limits']]);
    expect(pageChunks(page).chunks[1]!.id).toBe(chunks[1]!.id);
    expect(parsePage(page.markdown).checksum).not.toBe(parsePage(page.markdown + ' ').checksum);
  });
});

describe('sources', () => {
  it('maps file paths to URLs', () => {
    expect(urlForFile('/r', '/r/guides/intro.md', '/docs/')).toBe('/docs/guides/intro');
    expect(urlForFile('/r', '/r/index.mdx', '/docs')).toBe('/docs');
  });

  it('turns HTML into Markdown and keeps heading ids', () => {
    const { markdown, anchors } = htmlToMarkdown(
      '<html><body><nav>menu</nav><main><h1>Doc</h1><p>Hello <b>there</b>.</p><h2 id="setup-x">Setup</h2><ul><li>one</li></ul><pre>npm i</pre></main></body></html>',
    );
    expect(anchors).toEqual(['', 'setup-x']);
    expect(markdown).toContain('# Doc');
    expect(markdown).toContain('Hello there.');
    expect(markdown).toContain('- one');
    expect(markdown).not.toContain('menu');
  });
});
