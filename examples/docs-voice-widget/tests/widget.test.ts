// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorFor } from '../widget/src/element';
import { CartesiaAgentError } from '../widget/src/agents-web/errors';
import { findSection, highlightSection, sectionElements } from '../widget/src/highlight';
import { resolveTheme } from '../widget/src/theme';
import { DocsTools, isSamePage, sourceHref, type Source } from '../widget/src/tools';

const src: Source = { title: 'Client tools', heading: 'Results', url: '/docs/client-tools', anchor: 'results' };

describe('DocsTools', () => {
  it('search_docs returns the server result and remembers sources; show_source cites a known id', async () => {
    const cite = vi.fn();
    const searching: boolean[] = [];
    const tools = new DocsTools({
      search: async () => ({ result: '{"results":[]}', sources: { s1: src } }),
      cite,
      onSearching: (on) => searching.push(on),
    });
    expect(await tools.run('search_docs', { query: 'limits' })).toEqual({ result: '{"results":[]}' });
    expect(searching).toEqual([true, false]);
    expect(await tools.run('show_source', { source_id: 's1' })).toBeNull();
    expect(cite).toHaveBeenCalledWith('s1', src);
    await tools.run('show_source', { source_id: 'unknown' });
    expect(cite).toHaveBeenCalledTimes(1);
  });

  it('reports failures as error results', async () => {
    const tools = new DocsTools({ search: async () => { throw new Error('down'); }, cite: () => {}, onSearching: () => {} });
    expect((await tools.run('search_docs', { query: 'x' }))!.isError).toBe(true);
    expect((await tools.run('search_docs', {}))!.isError).toBe(true);
    expect((await tools.run('nope', {}))!.isError).toBe(true);
  });
});

describe('page helpers', () => {
  const loc = { href: 'https://site.dev/docs/client-tools?x=1', pathname: '/docs/client-tools' };
  it('knows when a source is on this page', () => {
    expect(isSamePage('/docs/client-tools', loc)).toBe(true);
    expect(isSamePage('https://site.dev/docs/client-tools/', loc)).toBe(true);
    expect(isSamePage('/docs/tools', loc)).toBe(false);
    expect(isSamePage('https://other.dev/docs/client-tools', loc)).toBe(false);
    expect(sourceHref(src, loc.href)).toBe('https://site.dev/docs/client-tools#results');
  });
});

describe('highlight', () => {
  beforeEach(() => {
    document.body.innerHTML = '<article><h1>Doc</h1><p>intro</p><h2 id="results">Results</h2><p>a</p><h3 id="sub">Sub</h3><p>b</p><h2 id="next">Next</h2><p>c</p></article>';
    Element.prototype.scrollIntoView = vi.fn();
    window.matchMedia = vi.fn(() => ({ matches: false }) as unknown as MediaQueryList);
  });

  it('takes the heading and everything up to the next heading of the same level', () => {
    const els = sectionElements(findSection('results')!);
    expect(els.map((e) => e.textContent)).toEqual(['Results', 'a', 'Sub', 'b']);
    expect(findSection('')!.textContent).toBe('Doc');
    expect(findSection('missing')).toBeNull();
  });

  it('scrolls to the section and adds one highlight box', () => {
    const colors = { tint: 'rgb(0 0 0 / .1)', edge: '#309d4b', blend: 'normal' };
    expect(highlightSection('results', colors)).toBe(true);
    expect(highlightSection('next', colors)).toBe(true);
    expect(document.querySelectorAll('[data-cartesia-docs-highlight]').length).toBe(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
    expect(highlightSection('missing', colors)).toBe(false);
  });
});

describe('theme', () => {
  it('follows the host page class, then the OS', () => {
    const html = document.documentElement;
    html.className = 'dark';
    expect(resolveTheme('auto', document, () => false)).toBe('dark');
    html.className = '';
    html.setAttribute('data-theme', 'light');
    expect(resolveTheme('auto', document, () => true)).toBe('light');
    html.removeAttribute('data-theme');
    expect(resolveTheme('auto', document, () => true)).toBe('dark');
    expect(resolveTheme('light', document, () => true)).toBe('light');
  });
});

describe('errorFor', () => {
  it('maps failures to fixed copy', () => {
    expect(errorFor(new CartesiaAgentError('mic_denied', 'x')).title).toBe('Microphone blocked');
    expect(errorFor({ status: 429 }).title).toBe('Too many sessions');
    expect(errorFor(new Error('raw upstream text')).detail).not.toContain('raw');
  });
});
